"use strict";
const { MKTEMP, CP, RMDIR } = require("./backend-executables.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { basename } = require("../core/paths.js");
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
function copyRecovery(app, staged, recovered, readFacts) {
    const original = readFacts(staged);
    if (!original.identity || original.size <= 0) { return { state: "retained", issues: [] }; }
    try { runArgv(app, [CP, staged, recovered], "keeping the validated PDF for recovery"); }
    catch (error) { return { state: "retained", issues: [recoveryIssue(error)] }; }
    const copied = readFacts(recovered);
    if (!copied.identity || copied.size !== original.size) {
        return { state: "retained", issues: [{ code: ISSUE.recovery, stage: "recovery", source: recovered, message: "The recovery copy could not be confirmed." }] };
    }
    return releaseRecoveredOriginal(app, staged);
}

function recoveryAttempt(app, staged, folder, readFacts) {
    const recovered = `${folder}/${basename(staged)}`;
    let outcome = { state: "retained", issues: [] };
    try { outcome = copyRecovery(app, staged, recovered, readFacts); }
    catch (error) { outcome.issues.push(recoveryIssue(error)); }
    if (outcome.state === "recovered") { return { ...outcome, path: recovered }; }
    const cleanup = [removeFile(app, recovered), cleanupArgv(app, [RMDIR, folder])];
    return { ...outcome, path: staged,
        issues: [...outcome.issues, ...cleanup.filter((result) => result.state === "failed").map((result) => result.issue)] };
}

function setAside(app, stagedPath, readFacts) {
    try {
        const folder = String(runArgv(app, [MKTEMP, "-d", "-t", RECOVERY_PREFIX])).trim();
        return recoveryAttempt(app, stagedPath, folder, readFacts);
    } catch (error) {
        return { state: "retained", path: stagedPath, issues: [recoveryIssue(error)] };
    }
}
module.exports = { setAside };
