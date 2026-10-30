"use strict";

// Native CLI transport keeps receipt JSON and prose on separate UTF-8 streams.
// Exit status is explicit; no osascript return-value or thrown-error wrapper.

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
function writeReceipt(text, ns = foundation(globalThis.ObjC, globalThis.$), stderr = false) {
    if (!ns) {
        return false;
    }

    (stderr ? ns.NSFileHandle.fileHandleWithStandardError : ns.NSFileHandle.fileHandleWithStandardOutput).writeData(
        ns(String(text)).dataUsingEncoding(UTF8_ENCODING)
    );

    return true;
}

function isCompleteSuccess(result) { return result.state === "complete"; }

function exitCli(code) { ObjC.import("stdlib"); return $.exit(code); }

module.exports = { exitCli, foundation, writeReceipt, isCompleteSuccess };
