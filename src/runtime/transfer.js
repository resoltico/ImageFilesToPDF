"use strict";

const { pathIsTaken } = require("./asking.js");
const { linkFrom, claimFrom, published, refused } = require("./claim.js");
const { stagingArea } = require("./staging-area.js");
const { copyBeside } = require("./output-copy.js");

/*
 * Getting the finished PDF from the workspace to the name the user will see.
 *
 * Claiming the name is claim.js's business, and both ways of doing it need
 * their source on the destination's own volume. This is about getting the PDF
 * there, and about doing it without ever letting go of the finished file.
 *
 * The claim is made from the workspace itself whenever it can be, which is
 * whenever the two are on one volume: the ordinary case, where the whole
 * publication is one operation and no file of ours appears in the output
 * folder under any other name. That claim is a link and only a link -- it
 * must not give up the PDF, because a failure afterwards has to still have
 * one to give back.
 *
 * Otherwise the PDF is copied into a place this run makes beside the
 * destination and claimed from there, where both operations are allowed
 * because the original is still in the workspace behind them.
 *
 * Renaming straight to the final name is what the copy replaced, and it is
 * atomic only when both ends are on one volume. Across volumes Apple's mv
 * copies to the pathname it is given: measured on an attached test volume, an
 * interrupted move left 3,211,264 bytes of a 1,258,291,200-byte file under
 * exactly the name the finished document was to have.
 *
 * What none of this decides is whether publication succeeded. That is settled
 * afterwards, by asking the output path which file it holds.
 */

/*
 * Why the link from the workspace was refused is half the story when the copy
 * cannot even be made. Once the copy is there it is not: what happens at the
 * destination speaks for itself, and a cross-volume link that was never going
 * to work explains nothing about it.
 */
function throughStaging(attempt, facts, refusal) {
    const { app, paths } = attempt;
    const copied = copyBeside(app, paths.staged, paths.area, facts.size);
    const staging = copied.made ? paths.area : null;

    if (copied.reasons.length > 0) {
        return { published: false, reasons: [...copied.reasons, refusal], staging };
    }

    return {
        ...claimFrom(attempt, paths.area.file),
        claimedIdentity: copied.identity,
        claimedSize: facts.size,
        staging
    };
}

/*
 * The claim from the workspace, and what to do when it is refused: stop if
 * the output name is taken, and otherwise take the PDF over to the
 * destination and claim it from beside it.
 */
function deliver(app, paths, facts, rename) {
    const said = linkFrom(app, paths.staged, paths.final);

    if (!said) {
        return {
            ...published(paths.staged),
            claimedIdentity: facts.identity,
            claimedSize: facts.size,
            staging: null
        };
    }

    return pathIsTaken(app, paths.final)
        ? { ...refused(["the output path was taken", said]), staging: null }
        : throughStaging({ app, paths, rename }, facts, said);
}

module.exports = { deliver, stagingArea };
