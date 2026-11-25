"use strict";
const { message } = require("../core/messages.js");
const { requireOriginal, unconfirmedClaim } = require("./publication-name.js");
const { OperationError } = require("../core/errors.js");
const { collisionPath, MAXIMUM_SUFFIX } = require("../core/naming.js");
const needsStaging = (state) => ["cross-device", "unsupported"].includes(state);

function copyBeside(job, staged, area, expected) {
    try { job.operations.openStaging(area); }
    catch (error) { return { state: "failed", area: null, error }; }
    try {
        job.operations.copyBeside(staged, area.file);
        const written = job.publication.facts(area.file);
        if (expected < 0 || written.size !== expected || !written.identity) {
            throw new OperationError(message("stagedFileSizeMismatch", { found: written.size, expected }));
        }
        return { state: "copied", area, ...written };
    } catch (error) { return { state: "failed", area, error }; }
}

function destinationCopy(context) {
    const { job, paths, facts } = context;
    requireOriginal(job.publication, { staged: paths.staged, expected: context.facts, cause: null });
    const area = job.operations.stagingArea(paths.final);
    const copied = copyBeside(job, paths.staged, area, facts.size);
    context.area = copied.area;
    requireOriginal(job.publication, { staged: paths.staged, expected: context.facts, cause: copied.error ?? null,
        candidate: copied.area ? { folder: copied.area.directory, ...(copied.state === "copied" ? { identity: copied.identity, size: copied.size } : {}) } : null });
    if (copied.state !== "copied") { throw copied.error; }
    Object.assign(context, { from: area.file, claimed: { identity: copied.identity, size: facts.size } });
}

async function claim(context) {
    const { job, paths } = context;
    context.diagnostic = null;
    let outcome = job.publication.link(context.from, paths.final);
    if (needsStaging(outcome.state)) {
        if (!context.area) { destinationCopy(context); outcome = job.publication.link(context.from, paths.final); }
        if (needsStaging(outcome.state) && job.publication.rename) { outcome = await job.publication.rename(context.from, paths.final); }
    }
    Object.assign(context, { diagnostic: { ...outcome.diagnostic, state: outcome.state } });
    return outcome;
}

/** Atomic claims share collision policy; callers own confirmation, release and checkpoints. */
async function claimAvailable(context, destination, created, checkpoint) {
    for (let attempt = 1; attempt < MAXIMUM_SUFFIX; attempt += 1) {
        checkpoint();
        context.paths.final = collisionPath(destination, attempt);
        const outcome = await claim(context);
        if (outcome.state === "created") {
            if (outcome.claimed) { Object.assign(context, { claimed: outcome.claimed }); }
            try { return created(context); }
            finally { outcome.close?.(); }
        }
        if (outcome.state === "unknown") {
            throw unconfirmedClaim(context.job.publication, { staged: context.paths.staged, original: context.facts,
                path: context.paths.final, claimed: context.claimed, diagnostic: outcome.diagnostic });
        }
        if (outcome.state !== "exists") { throw new OperationError(message("publicationClaimFailed", { state: outcome.state })); }
    }
    throw new OperationError(message("uniqueOutputUnavailable"));
}

module.exports = { claimAvailable };
