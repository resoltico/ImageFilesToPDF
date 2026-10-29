"use strict";
const { OperationError } = require("../core/errors.js");
const { collisionPath, MAXIMUM_SUFFIX } = require("../core/naming.js");
const { stagingArea } = require("./staging-area.js");
const { copyBeside } = require("./output-copy.js");
const needsStaging = (state) => ["cross-device", "unsupported"].includes(state);

function destinationCopy(context) {
    const { job, paths, facts } = context;
    const area = stagingArea(paths.final);
    const copied = copyBeside(job, paths.staged, area, facts.size);
    context.area = copied.area;
    if (copied.state !== "copied") { throw copied.error; }
    Object.assign(context, { from: area.file, claimed: { identity: copied.identity, size: facts.size } });
}

function claim(context) {
    const { job, paths } = context;
    let outcome = job.publication.link(context.from, paths.final);
    if (needsStaging(outcome.state)) {
        if (!context.area) { destinationCopy(context); outcome = job.publication.link(context.from, paths.final); }
        if (needsStaging(outcome.state)) { outcome = job.publication.rename(context.from, paths.final); }
    }
    context.diagnostic = { ...outcome.diagnostic, state: outcome.state };
    return outcome;
}

/** Atomic claims share collision policy; callers own confirmation, release and checkpoints. */
function claimAvailable(context, destination, created, checkpoint) {
    for (let attempt = 1; attempt < MAXIMUM_SUFFIX; attempt += 1) {
        checkpoint();
        context.paths.final = collisionPath(destination, attempt);
        const outcome = claim(context);
        if (outcome.state === "created") { return created(context); }
        if (outcome.state !== "exists") { throw new OperationError(`Publication ${outcome.state}: ${JSON.stringify(context.diagnostic)}`); }
    }
    throw new OperationError("Could not create a unique output filename.");
}
module.exports = { claimAvailable };
