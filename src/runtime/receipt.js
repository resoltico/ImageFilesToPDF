"use strict";

/*
 * The machine-readable outcome of a headless run.
 *
 * A caller needs two things that cannot both travel on the same channel: the
 * receipt, and an exit status that reflects whether the request was honoured.
 * osascript returns the script's value on success and its error on failure, so
 * an incomplete run either reports what happened or reports that it failed —
 * not both. Writing the receipt to standard output directly settles that: the
 * receipt goes out, then the error propagates and the process exits non-zero.
 */

const UTF8_ENCODING = 4;

/*
 * The namespace to write through, or null when there is none. A missing
 * bridge, a namespace that is not one, and a Foundation that will not load
 * are all the same answer, so they are all reached the same way.
 */
function foundation(objc, ns) {
    try {
        objc.import("Foundation");

        return ns ?? null;
    } catch {
        return null;
    }
}

/*
 * Reports whether it wrote, so a caller is never told a receipt exists when
 * the bridge was unavailable and it does not.
 */
function writeReceipt(text, ns = foundation(globalThis.ObjC, globalThis.$)) {
    if (!ns) {
        return false;
    }

    ns.NSFileHandle.fileHandleWithStandardOutput.writeData(
        ns(String(text)).dataUsingEncoding(UTF8_ENCODING)
    );

    return true;
}

/*
 * A run is completely successful only when every file that was asked for was
 * accounted for: nothing rejected before conversion, nothing failed during it.
 */
function isCompleteSuccess(result) {
    return result.failures.length === 0 && (result.rejected ?? []).length === 0;
}

function describeIncomplete(result) {
    const rejected = (result.rejected ?? []).length;
    const counts = [
        `${result.outputs.length} produced`,
        `${result.failures.length} failed`,
        `${rejected} not converted`
    ];

    return `The request was not completely honoured: ${counts.join(", ")}.`;
}

module.exports = {
    foundation,
    writeReceipt,
    isCompleteSuccess,
    describeIncomplete
};
