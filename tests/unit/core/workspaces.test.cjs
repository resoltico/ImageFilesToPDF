"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isWorkspaceName, validWorkspaceOwner, workspaceDisposition } = require("../../../src/core/workspaces.js");
const owner = { pid: 123, started: "Thu Oct 29 10:00:00 2026" };

test("only the mktemp workspace namespace is considered", () => {
    assert.equal(isWorkspaceName("ImageFilesToPDF.AbC123dEf4"), true);
    for (const name of ["ImageFilesToPDF.notes", "ImageFilesToPDF.AbC123dEf4/child", "prefixImageFilesToPDF.AbC123dEf4", "ImageFilesToPDF-recovered.AbC123dEf4"]) { assert.equal(isWorkspaceName(name), false); }
});

test("owner records require a positive exact PID and readable process-start text", () => {
    assert.equal(validWorkspaceOwner(owner), true);
    for (const record of [null, {}, { ...owner, pid: 0 }, { ...owner, pid: -1 }, { ...owner, pid: 1.5 }, { ...owner, pid: "123" }, { ...owner, started: "" }, { ...owner, started: "  " }, { ...owner, started: 123 }]) { assert.equal(validWorkspaceOwner(record), false); }
});

test("unknown or retained work never authorizes deletion, and PID reuse is not liveness", () => {
    assert.equal(workspaceDisposition(owner, true, []), "retained");
    assert.equal(workspaceDisposition(owner, undefined, []), "unreadable");
    assert.equal(workspaceDisposition(null, false, []), "unreadable");
    assert.equal(workspaceDisposition(owner, false, null), "unreadable");
    assert.equal(workspaceDisposition(owner, false, [owner]), "active");
    assert.equal(workspaceDisposition(owner, false, [{ ...owner, started: "Thu Oct 29 11:00:00 2026" }]), "reclaim");
    assert.equal(workspaceDisposition(owner, false, [{ ...owner, pid: 124 }]), "reclaim");
    assert.equal(workspaceDisposition(owner, false, []), "reclaim");
});
