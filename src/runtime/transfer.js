"use strict";

const { LN, MV, RM, SH, STAT } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { runArgv, pathIsTaken } = require("./shell.js");
const { stagingArea } = require("./staging-area.js");
const { copyBeside } = require("./output-copy.js");

/*
 * Getting the finished PDF from the workspace to the name the user will see.
 *
 * Every name this run writes to is one it took first, and nothing writes over
 * a name that was already there. Which operation takes it depends on what the
 * destination can do, and they are tried in that order.
 *
 * ln is the first: it creates the directory entry and fails if anything is
 * there -- measured, including that what is there is left exactly as it was,
 * and that a link whose target is gone still counts as there. It is also what
 * makes a publication provable afterwards, because the published name holds
 * the very file it was made from. It is made from the workspace file itself
 * whenever the two are on one volume, which is the ordinary case: the whole
 * publication is then one operation, no file of ours appears in the output
 * folder under any other name, and the workspace copy is never given up.
 *
 * An exclusive rename is the second, for everywhere a hard link cannot go:
 * the PDF is copied into a place this run made and moved from there in one
 * step that refuses an occupied name. FAT32 -- a camera card -- can do this
 * even though it has no hard links.
 *
 * The last is for a filesystem that can do neither, which exFAT measurably
 * cannot: there is no operation there that takes a name exclusively and
 * carries contents, so the name is taken empty and filled, by one shell, in
 * two adjacent system calls. What that leaves is written down in QA.md rather
 * than pretended away.
 *
 * What none of this decides is whether publication succeeded. That is settled
 * afterwards, by asking the output path which file it holds.
 */

/*
 * Refuse anything already at the name, take it, put the PDF in it, and give
 * the name back if that fails -- but only if what is there is still the empty
 * file this shell made, because by then it may not be.
 */
const TAKE_AND_FILL = [
    '[ ! -e "$1" ] || exit 1',
    "set -C",
    ': > "$1" || exit 1',
    `ours=$(${STAT} -f%i "$1")`,
    `${MV} "$0" "$1" && exit 0`,
    `[ "$(${STAT} -f%i "$1" 2>/dev/null)" = "$ours" ] && ${RM} -f "$1"`,
    "exit 1"
].join("; ");

function published(from) {
    return { published: true, reasons: [], claimed: from };
}

function refused(reasons) {
    return { published: false, reasons };
}

function claim(app, from, finalPath) {
    runArgv(app, [LN, from, finalPath], "claiming the output name");
}

function takeAndFill(attempt, from) {
    try {
        runArgv(
            attempt.app,
            [SH, "-c", TAKE_AND_FILL, from, attempt.paths.final],
            "taking the output name and putting the PDF in it"
        );
    } catch (error) {
        return refused([errorMessage(error)]);
    }

    return published(from);
}

/*
 * A refusal is not told apart by what it said -- errno does not reach here,
 * and neither does the reason a link was refused. It is told apart by asking
 * whether the name is taken: taken means stop, and free means the destination
 * could not do it and the next way is worth trying.
 */
function commitFromPlace(attempt) {
    const from = attempt.paths.area.file;

    if (attempt.rename && attempt.rename.rename(from, attempt.paths.final)) {
        return published(from);
    }

    return pathIsTaken(attempt.app, attempt.paths.final)
        ? refused(["the output path was taken"])
        : takeAndFill(attempt, from);
}

function throughStaging(attempt, facts, refusal) {
    const { app, paths } = attempt;
    const copied = copyBeside(app, paths.staged, paths.area, facts.size);
    const staging = copied.made ? paths.area : null;

    if (copied.reasons.length > 0) {
        return { published: false, reasons: [refusal, ...copied.reasons], staging };
    }

    const outcome = commitFromPlace(attempt);

    return {
        ...outcome,
        // Why the link was refused is half the story when the way round it
        // fails too.
        reasons: outcome.published ? [] : [refusal, ...outcome.reasons],
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
            ? { ...refused([refusal, "the output path was taken"]), staging: null }
            : throughStaging(attempt, facts, refusal);
    }
}

module.exports = { deliver, stagingArea };
