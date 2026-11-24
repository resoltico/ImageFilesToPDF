"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isWorkspaceName, validWorkspaceOwner } = require("../../../src/core/workspaces.js");
const owner = { pid: 123, started: "Thu Oct 29 10:00:00 2026" };

test("only the current workspace namespace is considered", () => {
    assert.equal(isWorkspaceName("run-AbC123"), true);
    for (const name of ["run-notes", "run-AbC123/child", "prefixrun-AbC123", "ImageFilesToPDF.AbC123dEf4"]) { assert.equal(isWorkspaceName(name), false); }
});

test("owner records require a positive exact PID and readable process-start text", () => {
    assert.equal(validWorkspaceOwner(owner), true);
    for (const record of [null, {}, { ...owner, pid: 0 }, { ...owner, pid: -1 }, { ...owner, pid: 1.5 }, { ...owner, pid: "123" }, { ...owner, started: "" }, { ...owner, started: "  " }, { ...owner, started: 123 }]) { assert.equal(validWorkspaceOwner(record), false); }
});
