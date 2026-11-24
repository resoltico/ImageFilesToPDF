"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { keep } = require("../../../src/application/recovery.js");
const { requireOriginal, actualPublicationPath } = require("../../../src/application/publication-name.js");
const { OperationError } = require("../../../src/core/errors.js");

const staged = "/private/staged.pdf";
const destination = "/output/photo.pdf";
const download = "/downloads/photo.pdf";
const original = { identity: "device:inode", size: 128 };
const publicationIssue = {
    code: "publication", stage: "publication", params: {}, message: "The PDF could not be saved to its requested destination.",
    diagnostic: ["Destination denied."]
};

function recoveryPort(options = {}) {
    const files = new Map([[staged, original]]);
    const events = [];
    const artifact = { path: staged, state: "validated" };
    const job = {
        workspace: "/private", artifacts: new Map([[staged, artifact]]),
        storage: { downloads: "/downloads/", entries: () => ["retain"], remove: (file) => events.push(["remove marker", file]) },
        publication: {
            facts(file) { return files.get(file) ?? { identity: "", size: -1 }; },
            link(from, to) {
                assert.equal(from, staged);
                assert.equal(to, download);
                if (options.deny) { return { state: "denied", diagnostic: { code: "EACCES" } }; }
                files.set(to, files.get(from));
                return { state: "created" };
            },
            actualPath(file, expected) { assert.deepEqual(expected, original); return file; }
        },
        operations: {
            removeFile(file) { events.push(["remove file", file]); files.delete(file); return { state: "removed" }; },
            setAside(file, publication, request) {
                events.push(["set aside", file, request]);
                if (options.losePrivate) { files.delete(file); }
                return { state: "retained", path: file, issues: [] };
            }
        }
    };
    const paths = { staged, intended: destination, original };
    return { job, paths, artifact, files, events };
}

function recoveryIssue() {
    return {
        code: "recovery", stage: "recovery", params: {}, message: "The PDF could not be recovered to Downloads.",
        diagnostic: { message: "The PDF destination could not be claimed (denied).", path: download,
            detail: { code: "EACCES", state: "denied" } }
    };
}

test("a verified Downloads claim releases the original and reports only the requested destination failure", () => {
    const { job, paths, artifact, files, events } = recoveryPort();
    const error = keep(job, paths, { reasons: ["Destination denied."] });
    assert.equal(error.recovery, download);
    assert.deepEqual(error.issues, [publicationIssue]);
    assert.equal(artifact.state, "released");
    assert.equal(files.has(staged), false);
    assert.deepEqual(files.get(download), original);
    assert.deepEqual(events, [["remove file", staged], ["remove marker", "/private/retain"]]);
});

test("when Downloads refuses the claim, the verified original gains no second public name", () => {
    const { job, paths, artifact, files, events } = recoveryPort({ deny: true });
    const error = keep(job, paths, { reasons: ["Destination denied."] });
    assert.equal(error.recovery, staged);
    assert.deepEqual(error.issues, [publicationIssue, recoveryIssue()]);
    assert.equal(artifact.state, "validated");
    assert.deepEqual([...files.keys()], [staged]);
    assert.deepEqual(events, [["set aside", staged, { intendedName: "photo.pdf", original }]]);
});

test("an original missing after recovery cannot be reported as a trustworthy location", () => {
    const { job, paths } = recoveryPort({ deny: true, losePrivate: true });
    assert.throws(() => keep(job, paths, { reasons: ["Destination denied."] }), (error) => {
        assert.equal(error.recovery, null);
        assert.equal(error.issues[0].stage, "publication");
        assert.match(error.message, /no trustworthy recovery path/u);
        return true;
    });
});

test("original verification rejects size as well as identity mismatch", () => {
    const changed = { ...original, size: 90 };
    assert.throws(() => requireOriginal({ facts: () => changed }, { staged, expected: original, cause: null }),
        (error) => error.recovery === null && error.issues[0].diagnostic.observed === changed);
});

test("a lost stored-name acknowledgement preserves secondary cleanup issues and the verified original", () => {
    const cleanup = { code: "cleanup", stage: "cleanup", message: "Closing the directory failed." };
    const refusal = new OperationError("The exact entry was unavailable.", { issues: [
        { code: "operation", stage: "publication", message: "The exact entry was unavailable." }, cleanup
    ] });
    const operations = { facts: () => original, actualPath() { throw refusal; } };
    assert.throws(() => actualPublicationPath(operations, { staged, original, path: destination, claimed: original }), (error) => {
        assert.equal(error.recovery, staged);
        assert.equal(error.cause, refusal);
        assert.equal(error.issues.length, 2);
        assert.equal(error.issues[0].stage, "publication");
        assert.equal(error.issues[0].code, "publication");
        assert.equal(error.issues[0].diagnostic.folder, "/output/");
        assert.equal(error.issues[1], cleanup);
        return true;
    });
});

test("a Downloads lookup fault leaves a verified original and a run-specific recovery diagnostic", () => {
    const { job, paths, artifact } = recoveryPort();
    const lookup = new TypeError("Downloads lookup failed.");
    Object.defineProperty(job.storage, "downloads", { get() { throw lookup; } });
    const failure = keep(job, paths, { reasons: ["Destination denied."] });
    assert.equal(artifact.state, "validated");
    assert.equal(failure.recovery, staged);
    assert.deepEqual(failure.issues.map(({ code, stage }) => [code, stage]), [["publication", "publication"], ["fault", "recovery"]]);
    assert.deepEqual(failure.issues[1].diagnostic, { message: "Downloads lookup failed.", path: undefined, detail: undefined });
});

test("a failed recovery marker release leaves the verified Downloads PDF and reports the cleanup stage", () => {
    const { job, paths, files } = recoveryPort();
    job.storage.remove = () => { throw new Error("Marker removal was denied."); };
    const failure = keep(job, paths, { reasons: ["Destination denied."] });
    assert.equal(failure.recovery, download);
    assert.deepEqual(files.get(download), original);
    assert.deepEqual(failure.issues.map(({ code, stage }) => [code, stage]), [["publication", "publication"], ["cleanup", "cleanup"]]);
});
