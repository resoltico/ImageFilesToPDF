"use strict";

const { LN, MV } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { runArgv, fileExists, pathIsTaken } = require("./shell.js");
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
 * Where the PDF is built was settled the same way. pdfcpu created the file in
 * the user's Downloads folder; afterwards /bin/mv could not rename it and
 * /bin/cp could not even read it, both refused with "Operation not
 * permitted", while copying in from the workspace was allowed throughout. So
 * nothing is built there, and the fallbacks below are the operations that
 * host permitted.
 *
 * Who owns the PDF while this is going on is publish.js.
 */

function claim(app, from, finalPath) {
    runArgv(app, [LN, from, finalPath], "claiming the output name");
}

/*
 * mv -n exits zero when it declines, so the file still being under the
 * staging name is the only evidence that nothing moved. This runs only for a
 * name that has just been found free on a filesystem that cannot make links,
 * which is the one case a rename is the best that can be done.
 */
function renameOnto(app, incoming, finalPath, refused) {
    try {
        runArgv(app, [MV, "-n", incoming, finalPath], "putting the PDF in place");
    } catch (error) {
        return { published: false, reasons: [refused, errorMessage(error)] };
    }

    return fileExists(app, incoming)
        ? { published: false, reasons: [refused, "the output path was taken"] }
        : { published: true, reasons: [], claimed: incoming };
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

function throughStaging(app, paths, refused) {
    const copied = copyBeside(app, paths.staged, paths.incoming);

    if (copied.reasons.length > 0) {
        return {
            published: false,
            reasons: [refused, ...copied.reasons],
            staged: copied.made
        };
    }

    return {
        ...claimFromStaging(app, paths.incoming, paths.final),
        staged: copied.made
    };
}

/*
 * The claim, and what to do when it is refused: stop if the output name is
 * taken, and otherwise go the long way round, because the refusal was about
 * the link rather than about the name.
 */
function deliver(app, paths) {
    try {
        claim(app, paths.staged, paths.final);

        return { published: true, reasons: [], claimed: paths.staged };
    } catch (error) {
        const refused = errorMessage(error);

        return pathIsTaken(app, paths.final)
            ? { published: false, reasons: [refused, "the output path was taken"] }
            : throughStaging(app, paths, refused);
    }
}

module.exports = { deliver };
