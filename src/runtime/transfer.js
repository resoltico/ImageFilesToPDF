"use strict";

const { LN, SH } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { runArgv, pathIsTaken } = require("./shell.js");
const { stagingArea } = require("./staging-area.js");
const { copyBeside } = require("./output-copy.js");

/*
 * Getting the finished PDF from the workspace to the name the user will see.
 *
 * Every name this run writes to is one it took first, and nothing writes over
 * a name that was already there.
 *
 * ln does that in one step: it creates the directory entry and fails if
 * anything is there -- measured, including that what is there is left exactly
 * as it was, and that a link whose target is gone still counts as there. It
 * is also what makes a publication provable afterwards, because the published
 * name holds the very file it was made from.
 *
 * The claim is made from the workspace file itself whenever it can be, which
 * is whenever the two are on one volume: the ordinary case, where the whole
 * publication is one operation, no file of ours appears in the output folder
 * under any other name, and the workspace copy is never given up.
 *
 * Where hard links cannot be made at all -- FAT and exFAT, which is what a
 * camera card is -- there is no exclusive create that also carries the
 * contents, and no exclusive rename to reach from here. So the name is taken
 * empty and filled in one step, by one shell, which refuses a name that is
 * there, and clears its own reservation away if the rename fails. That leaves
 * the name existing empty for the length of two adjacent system calls, which
 * is the price of publishing to a camera card at all.
 *
 * mv -n is what this replaced. It checks whether the destination exists and
 * then renames, which are two operations with a competing writer able to
 * arrive between them, and its check could not see a link whose target was
 * gone.
 *
 * What none of this decides is whether publication succeeded. That is settled
 * afterwards, by asking the output path which file it holds.
 */

/*
 * Refuse anything already at the name, take it exclusively, put the PDF in
 * it, and give the name back if that last step fails.
 */
const TAKE_AND_FILL =
    '[ ! -e "$1" ] || exit 1; set -C; : > "$1" || exit 1; ' +
    'mv "$0" "$1" || { rm -f "$1"; exit 1; }';

function claim(app, from, finalPath) {
    runArgv(app, [LN, from, finalPath], "claiming the output name");
}

function takeAndFill(app, from, finalPath, refused) {
    try {
        runArgv(
            app,
            [SH, "-c", TAKE_AND_FILL, from, finalPath],
            "taking the output name and putting the PDF in it"
        );
    } catch (error) {
        return { published: false, reasons: [refused, errorMessage(error)] };
    }

    return { published: true, reasons: [], claimed: from };
}

function claimFromStaging(app, from, finalPath) {
    try {
        claim(app, from, finalPath);

        return { published: true, reasons: [], claimed: from };
    } catch (error) {
        const refused = errorMessage(error);

        return pathIsTaken(app, finalPath)
            ? { published: false, reasons: [refused, "the output path was taken"] }
            : takeAndFill(app, from, finalPath, refused);
    }
}

function throughStaging(app, paths, facts, refused) {
    const copied = copyBeside(app, paths.staged, paths.area, facts.size);
    const staging = copied.made ? paths.area : null;

    if (copied.reasons.length > 0) {
        return { published: false, reasons: [refused, ...copied.reasons], staging };
    }

    return {
        ...claimFromStaging(app, paths.area.file, paths.final),
        claimedIdentity: copied.identity,
        claimedSize: facts.size,
        staging
    };
}

/*
 * The claim, and what to do when it is refused: stop if the output name is
 * taken, and otherwise go the long way round, because the refusal was about
 * the link rather than about the name.
 */
function deliver(app, paths, facts) {
    try {
        claim(app, paths.staged, paths.final);

        return {
            published: true,
            reasons: [],
            claimed: paths.staged,
            claimedIdentity: facts.identity,
            claimedSize: facts.size,
            staging: null
        };
    } catch (error) {
        const refused = errorMessage(error);

        return pathIsTaken(app, paths.final)
            ? {
                published: false,
                reasons: [refused, "the output path was taken"],
                staging: null
            }
            : throughStaging(app, paths, facts, refused);
    }
}

module.exports = { deliver, stagingArea };
