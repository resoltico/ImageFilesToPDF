"use strict";

const { LN, MV } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { runArgv, pathIsTaken } = require("./shell.js");
const { reserveName } = require("./reserve.js");
const { copyBeside } = require("./output-copy.js");

/*
 * Getting the finished PDF from the workspace to the name the user will see.
 *
 * Every name this run writes to is one it took first, and nothing writes over
 * a name that was already there. Two operations give that, and they are the
 * only two used.
 *
 * ln creates the directory entry in one step and fails if anything is there
 * -- measured, including that what is there is left exactly as it was, and
 * that a link whose target is gone still counts as there. It is also what
 * makes a publication provable afterwards: the published name holds the very
 * file it was made from.
 *
 * The shell's noclobber redirection creates an empty entry the same way, and
 * on the filesystems where a hard link cannot be made at all -- FAT and
 * exFAT, which is what a camera card is formatted as -- it is the only
 * exclusive create there is. A rename onto that reservation replaces this
 * run's own empty file, so it cannot replace anybody else's.
 *
 * mv -n is what this replaced. It checks whether the destination exists and
 * then renames, which are two operations: a competing writer between them was
 * overwritten, and the check could not see a link whose target was gone.
 *
 * The claim is made from the workspace file itself whenever it can be, which
 * is whenever the two are on one volume: the ordinary case, where the whole
 * publication is one operation, no file of ours appears in the output folder
 * under any other name, and the workspace copy is never given up.
 *
 * What none of this decides is whether publication succeeded. That is settled
 * afterwards, by asking the output path which file it holds.
 */

function claim(app, from, finalPath) {
    runArgv(app, [LN, from, finalPath], "claiming the output name");
}

/*
 * Where hard links are unsupported: take the name as an empty file, then put
 * the PDF into it in one rename. The reservation is this run's own, so the
 * rename replaces nothing that belonged to anyone else.
 */
function reserveAndRename(app, incoming, finalPath, refused) {
    try {
        reserveName(app, finalPath, "taking the output name");
    } catch (error) {
        return { published: false, reasons: [refused, errorMessage(error)], mine: [] };
    }

    try {
        runArgv(app, [MV, incoming, finalPath], "putting the PDF in place");
    } catch (error) {
        return {
            published: false,
            reasons: [refused, errorMessage(error)],
            mine: [finalPath]
        };
    }

    return { published: true, reasons: [], claimed: incoming, mine: [] };
}

function claimFromStaging(app, incoming, finalPath) {
    try {
        claim(app, incoming, finalPath);

        return { published: true, reasons: [], claimed: incoming, mine: [] };
    } catch (error) {
        const refused = errorMessage(error);

        return pathIsTaken(app, finalPath)
            ? {
                published: false,
                reasons: [refused, "the output path was taken"],
                mine: []
            }
            : reserveAndRename(app, incoming, finalPath, refused);
    }
}

function throughStaging(app, paths, facts, refused) {
    const copied = copyBeside(app, paths.staged, paths.incoming, facts.size);

    if (copied.reasons.length > 0) {
        return {
            published: false,
            reasons: [refused, ...copied.reasons],
            mine: copied.mine
        };
    }

    const outcome = claimFromStaging(app, paths.incoming, paths.final);

    return {
        ...outcome,
        claimedIdentity: copied.identity,
        claimedSize: facts.size,
        mine: [...copied.mine, ...outcome.mine]
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
            mine: []
        };
    } catch (error) {
        const refused = errorMessage(error);

        return pathIsTaken(app, paths.final)
            ? { published: false, reasons: [refused, "the output path was taken"], mine: [] }
            : throughStaging(app, paths, facts, refused);
    }
}

module.exports = { deliver };
