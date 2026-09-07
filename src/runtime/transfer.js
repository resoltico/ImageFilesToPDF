"use strict";

const { LN, MV } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { runArgv, pathIsTaken } = require("./shell.js");
const { copyBeside } = require("./output-copy.js");

/*
 * Getting the finished PDF from the workspace to the name the user will see.
 *
 * The name is claimed, not written to. ln creates the directory entry in one
 * step and fails if anything is already there -- measured, including that
 * what is already there is left exactly as it was, and that a link whose
 * target is gone still counts as there. Nothing else can produce a name
 * atomically, so nothing else is used to produce this one.
 *
 * The claim is made from the workspace file itself whenever it can be, which
 * is whenever the two are on one volume: the ordinary case, where the whole
 * publication is one operation and no file of ours ever appears in the output
 * folder under any other name. A hard link is not a second copy, and it is
 * indistinguishable from one afterwards -- measured: same mode, same owner,
 * same extended attributes, and it outlives the workspace it was made from.
 *
 * When that link cannot be made -- another volume, a filesystem without hard
 * links, or a host that refuses -- the PDF is copied into the output folder
 * under a hidden name and claimed from there. Which of those it was decides
 * what happens next, and it is decided by asking whether the output name is
 * taken rather than by reading the refusal.
 *
 * What none of this decides is whether publication succeeded. That is settled
 * afterwards, by asking the output path which file it holds: every step here
 * reports what it did, and publish.js reports what came of it.
 *
 * Where the PDF is built was settled the same way. pdfcpu created the file in
 * the user's Downloads folder; afterwards /bin/mv could not rename it and
 * /bin/cp could not even read it, both refused with "Operation not
 * permitted", while copying in from the workspace was allowed throughout. So
 * nothing is built there, and the fallbacks below are the operations that
 * host permitted.
 */

function claim(app, from, finalPath) {
    runArgv(app, [LN, from, finalPath], "claiming the output name");
}

/*
 * The rename that stands in where hard links are unsupported. mv -n exits
 * zero when it declines, and it used to be asked whether the staging file was
 * gone to find out which had happened -- a question that answers "gone" when
 * it cannot be put at all, so a refused inspection read as a publication.
 * Nothing is concluded here: the identity of the file at the output path is
 * what settles it.
 */
function renameOnto(app, incoming, finalPath, refused) {
    try {
        runArgv(app, [MV, "-n", incoming, finalPath], "putting the PDF in place");
    } catch (error) {
        return { published: false, reasons: [refused, errorMessage(error)] };
    }

    return { published: true, reasons: [], claimed: incoming };
}

function claimFromStaging(app, incoming, finalPath) {
    try {
        claim(app, incoming, finalPath);

        return { published: true, reasons: [], claimed: incoming };
    } catch (error) {
        const refused = errorMessage(error);

        return pathIsTaken(app, finalPath)
            ? { published: false, reasons: [refused, "the output path was taken"] }
            : renameOnto(app, incoming, finalPath, refused);
    }
}

function throughStaging(app, paths, facts, refused) {
    const copied = copyBeside(app, paths.staged, paths.incoming, facts.size);

    if (copied.reasons.length > 0) {
        return {
            published: false,
            reasons: [refused, ...copied.reasons],
            staged: copied.made
        };
    }

    return {
        ...claimFromStaging(app, paths.incoming, paths.final),
        claimedIdentity: copied.identity,
        claimedSize: facts.size,
        staged: copied.made
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
            claimedSize: facts.size
        };
    } catch (error) {
        const refused = errorMessage(error);

        return pathIsTaken(app, paths.final)
            ? { published: false, reasons: [refused, "the output path was taken"] }
            : throughStaging(app, paths, facts, refused);
    }
}

module.exports = { deliver };
