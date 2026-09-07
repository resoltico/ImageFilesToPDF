"use strict";

const { setAside } = require("./rescue.js");
const { basename } = require("../core/paths.js");
const { removeFile } = require("./shell.js");

/*
 * What a failed publication leaves behind, and where the finished PDF goes.
 *
 * One rule, and it is about ownership rather than about inspection: this run
 * removes only what this run made, and the PDF stays in the workspace until
 * the output path has been checked. The workspace copy used to be moved into
 * the output folder, so a failure afterwards had to work out where the bytes
 * were -- through a check that answers "no" both when a file is absent and
 * when the question could not be put at all. A refused check therefore
 * deleted the finished PDF and reported it missing.
 */

function describeFailure(reasons, whereabouts) {
    return [
        "The PDF could not be published without overwriting another file.",
        ...reasons,
        whereabouts
    ].join("\n\n");
}

/*
 * What this attempt left in the output folder: the staging copy, if it got as
 * far as making one, and the link a claim leaves inside a folder that is
 * standing at the output path -- ln puts it in there rather than refusing.
 * Both are this run's own, which is what makes removing them safe, and a
 * staging copy this run did not make is not one of them.
 *
 * Nothing is asked about either unless this attempt made it: an ordinary
 * publication, which is a link and nothing else, never names a staging file
 * at all.
 */
function clearAway(job, paths, outcome) {
    if (outcome.staged) {
        removeFile(job.app, paths.incoming);
    }

    if (outcome.claimed) {
        // Where a claim goes when a folder is standing at the output path.
        removeFile(job.app, `${paths.final}/${basename(outcome.claimed)}`);
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
    clearAway(job, paths, outcome);

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
