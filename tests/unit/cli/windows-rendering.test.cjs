"use strict";
const { inspectModule } = require("../ports/inspect-module.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { nativeWindowsPath } = require("../../../src/cli/paths.js");
const { receiptText } = inspectModule(require.resolve("../../../src/cli/transport.js"), ["receiptText"]);
const { reportText } = require("../../../src/core/run-report.js");
const { runOutcome } = require("../../../src/core/outcomes.js");
const { assertReceipt } = require("../../integration/lib/receipt.cjs");

test("Windows presentation uses native paths in prose and receipts without editing canonical outcomes", () => {
    const saved = { state: "saved", output: "C:/Photos/été.pdf", sources: ["C:/Photos/été.png"], pages: 1, issues: [] };
    const failed = { state: "failed", sources: ["C:/Photos/other.png"], pages: 0, issues: [
        { code: "fault", stage: "preparation", params: {}, source: "C:/Photos/other.png", message: "The conversion failed.",
            diagnostic: { candidate: { path: "D:/workspace/staged.pdf" }, stack: "private" } }
    ] };
    const refused = { path: "C:/Photos/notes.txt", name: "notes.txt", reason: "Unsupported.", code: "unsupported-format", stage: "selection" };
    const outcome = runOutcome([saved, failed], [refused]);
    const parsed = JSON.parse(receiptText(outcome, nativeWindowsPath));
    assertReceipt(parsed);
    assert.equal(parsed.documents[0].output, "C:\\Photos\\été.pdf");
    assert.deepEqual(parsed.documents[0].sources, ["C:\\Photos\\été.png"]);
    assert.equal(parsed.documents[1].issues[0].diagnostic.candidate.path, "D:\\workspace\\staged.pdf");
    assert.equal(parsed.documents[1].issues[0].source, "C:\\Photos\\other.png");
    assert.equal(parsed.rejected[0].path, "C:\\Photos\\notes.txt");
    const prose = reportText(outcome, true, nativeWindowsPath);
    assert.match(prose, /Saved to:\nC:\\Photos\\\nété\.pdf/u);
    assert.match(prose, /C:\\Photos\\other\.png: The conversion failed/u);
    assert.match(prose, /C:\\Photos\\notes\.txt: Unsupported/u);
    assert.equal(outcome.documents[0].output, "C:/Photos/été.pdf");
    assert.equal(nativeWindowsPath("https://example.test/a/b"), "https://example.test/a/b");
});
