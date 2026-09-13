"use strict";

const { keep } = require("./recovery.js");
const { deliver, stagingArea } = require("./transfer.js");
const { fileFacts } = require("./file-facts.js");
const { pathIsTaken } = require("./asking.js");
const { confirm, abandon } = require("./settling.js");

/*
 * Who owns a finished PDF, and where it goes when it cannot be published.
 *
 * The bytes are transfer.js's business, and what the output path holds is
 * settling.js's. This is the rule about the file: the job owns the PDF it
 * built until the output path has been checked, and this run removes only
 * what this run made. Nothing here counts -- QA.md has what both were
 * learned from.
 */

/*
 * Why not to start: a PDF that cannot be identified cannot be shown to have
 * been published, and a name that is taken is not this run's to take. The
 * check on the name is a courtesy -- the claim is what makes it safe -- but
 * it is a better message than a refused link.
 */
function refuseBefore(app, paths, facts) {
    if (!facts.identity) {
        return `The finished PDF could not be measured:\n\n${paths.staged}`;
    }

    return pathIsTaken(app, paths.final)
        ? `The output path became occupied before publication:\n\n${paths.final}`
        : "";
}

function settle(job, paths, outcome) {
    if (!outcome.abandoned) {
        throw keep(job, paths, outcome);
    }

    return abandon(job, paths, outcome);
}

/*
 * What is about to be published is measured first, so that what was published
 * can be told apart from anything else that might be at the name afterwards.
 */
function attempt(job, paths) {
    const facts = fileFacts(job.app, paths.staged);
    const refusal = refuseBefore(job.app, paths, facts);

    if (refusal) {
        throw keep(job, paths, { reasons: [refusal], staging: null });
    }

    const outcome = deliver(job, paths, facts);

    if (outcome.published) {
        confirm(job, paths, outcome);

        return false;
    }

    return settle(job, paths, outcome);
}

function publishPdf(job, stagedPath, finalPath) {
    const paths = {
        staged: stagedPath,
        area: stagingArea(finalPath),
        final: finalPath
    };

    job.progress.phase("Saving PDF");
    job.unpublished.add(stagedPath);

    // Whether the run was asked to stop while this was being published. The
    // PDF is at the name either way; what the caller does next is not.
    return attempt(job, paths);
}

module.exports = { publishPdf };
