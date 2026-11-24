"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { retainCandidate, clearRetention, releaseOwnedArtifact } = require("../../../src/application/workspace.js");
const { registerArtifact } = require("../../../src/core/artifacts.js");

function fixture() {
    const events = [], files = new Map();
    const workspace = "/owned/run";
    const marker = `${workspace}/retain`;
    const artifacts = new Map();
    const storage = {
        entries(path) {
            assert.equal(path, workspace);
            return files.has(marker) ? ["retain"] : [];
        },
        write(path, text) { events.push(["write", path, text]); files.set(path, text); },
        remove(path) { events.push(["remove", path]); assert.ok(files.delete(path)); }
    };
    return { job: { workspace, artifacts, storage }, marker, files, events };
}

test("retain before validation, and clear only after every outstanding artifact is released", () => {
    const { job, marker, files, events } = fixture();
    clearRetention(job);
    const first = registerArtifact(job.artifacts, "/owned/run/first.pdf");
    const second = registerArtifact(job.artifacts, "/owned/run/second.pdf");
    first.state = "validating";
    second.state = "validated";
    retainCandidate(job);
    assert.deepEqual(events, [["write", marker, "validating\n"]]);
    first.state = "validated";
    releaseOwnedArtifact(job, first.path);
    assert.equal(first.state, "released");
    assert.equal(files.get(marker), "validating\n");
    releaseOwnedArtifact(job, second.path);
    assert.equal(second.state, "released");
    assert.deepEqual(events, [["write", marker, "validating\n"], ["remove", marker]]);
});

test("a failed retention-marker removal keeps the path, cause and cleanup wording", () => {
    const { job, marker, files } = fixture();
    retainCandidate(job);
    const denied = new Error("Permission denied");
    job.storage.remove = (path) => { assert.equal(path, marker); throw denied; };
    assert.throws(() => clearRetention(job), (failure) => {
        assert.equal(failure.cause, denied);
        assert.deepEqual(failure.issues, [{
            code: "cleanup", stage: "cleanup", message: "The workspace retention marker could not be cleared.",
            diagnostic: { path: "/owned/run" }
        }]);
        return true;
    });
    assert.ok(files.has(marker));
});
