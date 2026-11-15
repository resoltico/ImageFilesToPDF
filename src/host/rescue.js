"use strict";
const { actualPublicationPath, requireOriginal } = require("./publication-name.js");
const { MKTEMP, CP, RMDIR } = require("./backend-executables.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { dirname } = require("../core/paths.js");
const { runArgv, cleanupArgv, removeFile } = require("./shell.js");
const RECOVERY_PREFIX = "ImageFilesToPDF-recovered";

function recoveryIssue(error) {
    const [issue] = issuesOf(error, "recovery");
    return { ...issue, code: issue.code === ISSUE.operation ? ISSUE.recovery : issue.code };
}

function releaseRecoveredOriginal(app, staged) {
    const removed = removeFile(app, staged);
    return { state: "recovered", issues: removed.state === "failed" ? [removed.issue] : [] };
}

/** Copy before release: an interrupted recovery cannot move away the only known copy. */
function copyRecovery(app, { staged, recovered, original }, publication) {
    requireOriginal(publication, { staged, expected: original, cause: null, candidate: { folder: dirname(recovered) } });
    try { runArgv(app, [CP, staged, recovered], "keeping the validated PDF for recovery"); }
    catch (error) { requireOriginal(publication, { staged, expected: original, cause: error, candidate: { folder: dirname(recovered) } }); return { state: "retained", issues: [recoveryIssue(error)] }; }
    const copied = publication.facts(recovered);
    const candidate = { folder: dirname(recovered), identity: copied.identity, size: copied.size };
    requireOriginal(publication, { staged, expected: original, cause: null, candidate });
    if (!copied.identity || copied.size !== original.size) {
        return { state: "retained", issues: [{ code: ISSUE.recovery, stage: "recovery", source: recovered, message: "The recovery copy could not be confirmed." }] };
    }
    const path = actualPublicationPath(publication, { staged, original, path: recovered, claimed: copied });
    requireOriginal(publication, { staged, expected: original, cause: null, candidate: { path, identity: copied.identity, size: copied.size } });
    return { ...releaseRecoveredOriginal(app, staged), path };
}

function recoveryAttempt(app, { staged, recovered, original }, publication) {
    const folder = dirname(recovered).replace(/\/$/u, "");
    let outcome = { state: "retained", issues: [] };
    try { outcome = copyRecovery(app, { staged, recovered, original }, publication); }
    catch (error) { if (error && Object.hasOwn(error, "recovery")) { throw error; } requireOriginal(publication, { staged, expected: original, cause: error, candidate: { folder: dirname(recovered) } }); outcome.issues.push(recoveryIssue(error)); }
    if (outcome.state === "recovered") { return outcome; }
    requireOriginal(publication, { staged, expected: original, cause: null, candidate: { folder: dirname(recovered) } });
    const cleanup = [removeFile(app, recovered), cleanupArgv(app, [RMDIR, folder])];
    return { ...outcome, path: staged,
        issues: [...outcome.issues, ...cleanup.filter((result) => result.state === "failed").map((result) => result.issue)] };
}

function setAside(app, stagedPath, publication, { intendedName, original }) {
    try {
        requireOriginal(publication, { staged: stagedPath, expected: original, cause: null });
        const folder = String(runArgv(app, [MKTEMP, "-d", "-t", RECOVERY_PREFIX])).trim();
        return recoveryAttempt(app, { staged: stagedPath, recovered: `${folder}/${intendedName}`, original }, publication);
    } catch (error) {
        if (error && Object.hasOwn(error, "recovery")) { throw error; }
        requireOriginal(publication, { staged: stagedPath, expected: original, cause: error });
        return { state: "retained", path: stagedPath, issues: [recoveryIssue(error)] };
    }
}
module.exports = { setAside };
