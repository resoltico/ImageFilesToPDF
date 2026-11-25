"use strict";
const { inspectModule } = require("../../../tests/unit/ports/inspect-module.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { runInNewContext } = require("node:vm");
const { RUN_OUTCOME, runOutcome } = require("../../../src/core/outcomes.js");
const { completionMessage } = inspectModule(require.resolve("../../../src/finder/quick-action/completion.js"), ["completionMessage"]);
const { exitCode } = require("../../../src/cli/exit-code.js");
const { assertReceipt } = require("../../../tests/integration/lib/receipt.cjs");
const { setupToolProblem, setupFailure } = require("../../../src/core/setup.js");
const receiptSchema = require("../../../tests/integration/lib/receipt.schema.json");

test("every declared run outcome has an exchange value, CLI status and Finder headline", () => {
    const expected = {
        complete: [0, "Created 1 PDF."],
        incomplete: [1, "Finished with issues."],
        canceled: [1, "Stopped. No PDF was created."],
        "invalid-request": [2, "The request is invalid."],
        "setup-failed": [3, "Setup failed."]
    };
    const kinds = Object.values(RUN_OUTCOME).sort();
    assert.deepEqual([...receiptSchema.properties.state.enum].sort(), kinds);
    assert.deepEqual(Object.keys(expected).sort(), kinds);
    const saved = { state: "saved", output: "/image.pdf", sources: ["/image.png"], pages: 1, issues: [] };
    const failure = { state: "failed", sources: ["/image.png"], pages: 0, issues: [] };
    for (const state of kinds) {
        const [status, headline] = expected[state];
        const receipt = { ...runOutcome([state === "complete" ? saved : failure]), state };
        assert.equal(exitCode(receipt), status);
        assert.equal(completionMessage(receipt).split("\n")[0], headline);
    }
    const invalid = { ...runOutcome(), state: "undeclared" };
    assert.throws(() => exitCode(invalid), /Unknown run outcome/u);
    assert.throws(() => completionMessage(invalid), /Unknown run outcome/u);
});

test("the installation hint is a separate setup issue in the exchange and Finder completion", () => {
    const missing = setupToolProblem("tool-missing", "pdfcpu");
    const { issues } = setupFailure([missing], "darwin");
    const receipt = runOutcome([], [], issues);
    assertReceipt(receipt);
    assert.equal(exitCode(receipt), 3);
    assert.deepEqual(receipt.issues.map(({ code }) => code), ["tool-missing", "install-hint"]);
    const text = completionMessage(receipt);
    assert.match(text, /^Setup failed\./u);
    assert.match(text, /pdfcpu could not be found\./u);
    assert.match(text, /Install pdfcpu\. See the installation guide .*#macos/u);
});

test("the CLI runtime guard includes the platform guide and preserves data-only receipt parameters", async () => {
    const { guardedBundle } = await import("../../node-boot.mjs");
    const candidate = guardedBundle("throw new Error('The unsupported runtime reached the bundle.');");
    for (const [platform, section] of [["darwin", "macos"], ["linux", "linux"], ["win32", "windows"]]) {
        const output = {};
        const process = { platform, versions: { node: "25.9.0" } };
        const requireStub = (moduleName) => {
            assert.equal(moduleName, "node:fs");
            return { writeSync(stream, record) { output[stream] = record; } };
        };
        runInNewContext(candidate, { process, require: requireStub });
        assert.equal(process.exitCode, 3);
        const receipt = JSON.parse(output[1]);
        assertReceipt(receipt);
        assert.deepEqual(receipt.issues[0].params, { minimum: "26.13.1", found: "25.9.0" });
        const wording = `Node.js 26.13.1 or later is required. Found Node.js 25.9.0. See the installation guide (https://github.com/resoltico/ImageFilesToPDF#${section}).`;
        assert.equal(receipt.issues[0].message, wording);
        assert.ok(output[2].includes(wording));
    }
});
