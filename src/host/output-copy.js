"use strict";
const { CP } = require("./backend-executables.js");
const { OperationError, isUserCancelled } = require("../core/errors.js");
const { runArgv } = require("./shell.js");
const { openStaging } = require("./staging-area.js");
const SIZE_UNKNOWN = -1;

function copyFailure(error, area) {
    return { state: isUserCancelled(error) ? "cancelled" : "failed", area, error };
}

function copiedFacts(job, area, expected) {
    const written = job.publication.facts(area.file);
    if (expected === SIZE_UNKNOWN || written.size !== expected) {
        return { state: "failed", area, error: new OperationError(`the staged file is ${written.size} bytes where ${expected} were expected`) };
    }
    return { state: "copied", area, identity: written.identity, size: written.size };
}

/** Only an exclusively created area is returned as owned on failure. */
function copyBeside(job, staged, area, expected) {
    try { openStaging(job.app, area); }
    catch (error) { return copyFailure(error, null); }
    try { runArgv(job.app, [CP, staged, area.file], "copying the PDF into the output folder"); }
    catch (error) { return copyFailure(error, area); }
    try { return copiedFacts(job, area, expected); }
    catch (error) { return copyFailure(error, area); }
}
module.exports = { copyBeside };
