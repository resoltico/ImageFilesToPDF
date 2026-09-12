"use strict";

const { UserCancelled } = require("../core/errors.js");

/*
 * Where a stop takes effect.
 *
 * A cancellation arriving through a progress surface is recorded rather than
 * thrown on, because the place it arrives is wherever a report happened to be
 * made and that is no guide to whether stopping there is safe. So the run
 * asks, at the places where it is.
 *
 * A checkpoint is a place where stopping costs nothing: before an image is
 * started, once every page is prepared, and once the PDF is built and
 * validated but not yet published. At each of those the only things that
 * exist are in the workspace, and the workspace goes when the run does.
 *
 * There is no checkpoint inside a publication, and that is the whole reason
 * this is a rule rather than a reflex. Publication owns a finished PDF and a
 * name it has claimed, and unwinding it from an unrelated signal is how both
 * are lost -- which is what publish.js spends its header on. Once publication
 * starts it finishes, and the stop is honoured at the next checkpoint.
 *
 * Nor is there one inside a separate run's image. Stopping there would
 * abandon it half converted and, worse, would carry the escape past the loop
 * that holds the list of PDFs already published -- and that list is the one
 * thing a stopped separate run must not lose. One image is the bound on how
 * long such a run ignores a stop, and that is the right trade.
 */
function checkpoint(progress) {
    if (progress.stopped()) {
        throw new UserCancelled();
    }
}

module.exports = { checkpoint };
