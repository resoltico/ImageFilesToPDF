"use strict";

const { LN } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { runArgv } = require("./shell.js");
const { pathIsTaken } = require("./asking.js");
const { stagingArea } = require("./staging-area.js");
const { copyBeside } = require("./output-copy.js");

/*
 * Getting the finished PDF from the workspace to the name the user will see.
 *
 * One rule, and nothing is allowed to bend it: the output name is created
 * only by an operation that puts the finished PDF there in one step. Nothing
 * else ever writes to that name.
 *
 * Two operations do that, and which is used depends on what the destination
 * can do. ln creates the directory entry and fails if anything is there --
 * measured, including that what is there is left exactly as it was, and that
 * a link whose target is gone still counts as there. It is made from the
 * workspace file itself whenever the two are on one volume, which is the
 * ordinary case: the whole publication is then one operation, no file of ours
 * appears in the output folder under any other name, and the workspace copy
 * is never given up.
 *
 * An exclusive rename does the same for everywhere a hard link cannot go: the
 * PDF is copied into a place this run made and moved out of it in one step
 * that refuses an occupied name. FAT32 -- a camera card -- can do this even
 * though it has no hard links.
 *
 * Where a destination can do neither, this stops. It used to take the name as
 * an empty file and fill it, which meant the name existed before the PDF was
 * in it, and meant a later move and a later removal acting on whatever was at
 * that name by then rather than on the file this run made. No guard fixes
 * that: proving the entry matches something measured a moment ago is not
 * proving it is the file that was created, and there is no compare-and-delete
 * to close the gap. So the name is not created until it can be created whole,
 * and a destination that cannot do that is told about instead.
 *
 * What none of this decides is whether publication succeeded. That is settled
 * afterwards, by asking the output path which file it holds.
 */

function published(from) {
    return { published: true, reasons: [], claimed: from };
}

function refused(reasons) {
    return { published: false, reasons };
}

function claim(app, from, finalPath) {
    runArgv(app, [LN, from, finalPath], "claiming the output name");
}

/*
 * Why an attempt was refused is not something this can read: the reason a
 * hard link failed comes back as a message, and the exclusive rename's does
 * not come back at all -- errno is not reachable through the bridge. So it is
 * asked of the filesystem instead. A name that is taken is one answer, and
 * every other refusal is the destination being unable to take it.
 */
function whyRefused(app, finalPath) {
    return pathIsTaken(app, finalPath)
        ? "the output path was taken"
        : "this drive cannot take the output name in one step, " +
            "so the PDF was not put on it";
}

function commitFromPlace(attempt) {
    const { app, paths } = attempt;
    const from = paths.area.file;

    return attempt.rename && attempt.rename.rename(from, paths.final)
        ? published(from)
        : refused([whyRefused(app, paths.final)]);
}

function throughStaging(attempt, facts, refusal) {
    const { app, paths } = attempt;
    const copied = copyBeside(app, paths.staged, paths.area, facts.size);
    const staging = copied.made ? paths.area : null;

    if (copied.reasons.length > 0) {
        return { published: false, reasons: [...copied.reasons, refusal], staging };
    }

    const outcome = commitFromPlace(attempt);

    return {
        ...outcome,
        // Why the link was refused is half the story when the way round
        // it fails too -- but it is the system's own words, and those go
        // after the plain ones rather than in front of them.
        reasons: outcome.published ? [] : [...outcome.reasons, refusal],
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
function deliver(app, paths, facts, rename) {
    const attempt = { app, paths, rename };

    try {
        claim(app, paths.staged, paths.final);

        return {
            ...published(paths.staged),
            claimedIdentity: facts.identity,
            claimedSize: facts.size,
            staging: null
        };
    } catch (error) {
        const refusal = errorMessage(error);

        return pathIsTaken(app, paths.final)
            ? { ...refused(["the output path was taken", refusal]), staging: null }
            : throughStaging(attempt, facts, refusal);
    }
}

module.exports = { deliver, stagingArea };
