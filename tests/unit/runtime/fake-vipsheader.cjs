"use strict";

/*
 * vipsheader answers four different questions here — the dimensions that
 * decide placement, the band count, and the page count — so a matcher keyed
 * on the tool name alone would answer them all with the same number.
 */
function headerField(host, command) {
    if (command.includes("'width'")) {
        return String(host.width ?? 600);
    }

    if (command.includes("'height'")) {
        return String(host.height ?? 400);
    }

    return command.includes("n-pages")
        ? String(host.pages ?? 1)
        : String(host.bands);
}

module.exports = { headerField };
