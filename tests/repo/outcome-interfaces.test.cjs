"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { RUN_OUTCOME, runOutcome } = require("../../src/core/outcomes.js");
const { completionMessage } = require("../../src/host/quick-action/completion.js");
const { exitCode } = require("../../src/node/transport.js");
const receiptSchema = require("../integration/receipt.schema.json");

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
