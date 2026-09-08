"use strict";

const { setAside } = require("./rescue.js");
const { closeStaging } = require("./staging-area.js");
const { removeFile } = require("./shell.js");

/*
 * What a failed publication leaves behind, and where the finished PDF goes.
 *
 * One rule, and it is about ownership rather than about inspection: this run
 * removes only the names it took, and the PDF stays in the workspace until
 * the output path has been checked.
 *
 * Both halves were learned the hard way. The workspace copy used to be moved
 * into the output folder, so a failure afterwards had to work out where the
 * bytes were -- through a check that answers "no" both when a file is absent
 * and when the question could not be put at all, so a refused check deleted
 * the finished PDF and reported it missing. And what to clear away used to be
 * worked out from pathnames rather than recorded: a file another program had
 * put at the staging name, and a document inside a folder that appeared at
 * the output path, were both deleted for having a name this run recognised.
 */

function describeFailure(reasons, whereabouts) {
    return [
        "The PDF could not be saved where it was meant to go.",
        ...reasons,
        whereabouts
    ].join("\n\n");
}

/*
 * What this attempt made and does not need: the place it made in the output
 * folder, and -- when a folder was standing at the output path, which ln
 * links into rather than refusing -- the link left inside it, which publish.js
 * adds once it has confirmed the file there is the one this run published.
 */
function clearAway(job, outcome) {
    if (outcome.staging) {
        closeStaging(job.app, outcome.staging);
    }

    for (const path of outcome.mine ?? []) {
        removeFile(job.app, path);
    }
}

/*
 * Every way publication can fail ends here. The finished PDF is in the
 * workspace, where it was built and where it has stayed, so it is put
 * somewhere that will outlive the run and the message says where.
 *
 * Setting aside is best effort: when it fails the file stays where it was,
 * and the workspace has to stay with it. That is what the unpublished set
 * decides, so it is cleared only when the PDF is somewhere else.
 */
function keep(job, paths, outcome) {
    clearAway(job, outcome);

    const recovered = setAside(job.app, paths.staged);

    if (recovered !== paths.staged) {
        job.unpublished.delete(paths.staged);
    }

    return new Error(describeFailure(
        outcome.reasons,
        `The finished PDF has been kept here:\n\n${recovered}`
    ));
}

module.exports = { keep, clearAway };
