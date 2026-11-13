"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { IssueError, OperationError, UserCanceled, commandOf } = require("../../../src/core/errors.js");
const { issuesOf } = require("../../../src/core/outcomes.js");

test("typed constructor fields retain issues, command, recovery and confirmed outcome", () => {
    const issues = [{ code: "publication", stage: "publication", message: "Cannot save." }];
    const outcome = { documents: [] };
    const cause = new Error("native");
    const error = new OperationError("Cannot save.", { cause, issues, recovery: "/kept.pdf", command: "mv", outcome, stack: "original stack" });
    assert.equal(error.cause, cause);
    assert.equal(error.issues, issues);
    assert.equal(error.recovery, "/kept.pdf");
    assert.equal(error.outcome, outcome);
    assert.equal(error.stack, "original stack");
    assert.equal(commandOf(new Error("wrapped", { cause: error })), "mv");
    assert.equal(issuesOf(error, "setup"), issues);
    assert.equal(issuesOf(new IssueError("fault"), "setup")[0].code, "fault");
    assert.equal(issuesOf(new OperationError("expected"), "setup")[0].code, "operation");
    const stopped = new UserCanceled({ cause, issues });
    assert.equal(stopped.cause, cause);
    assert.equal(stopped.issues, issues);
});
