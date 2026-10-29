"use strict";
const { hostError } = require("./cancellation.js");

const { createProgress } = require("./progress.js");
const { openPanel } = require("./panel.js");

/*
 * Nothing is reported to a caller that is reading a receipt, and nothing is
 * built for it either: a headless run must not touch AppKit, must not raise an
 * activation policy, and has nothing to tear down.
 *
 * Anything thrown while establishing a surface is a run with no progress, not
 * a run that fails. This is called before the try that reports errors, so it
 * has to be the one thing here that cannot throw at all.
 */
function progressSurfaces(build) {
    const sinks = [];
    const diagnostics = [];
    for (const open of build) {
        try { const sink = open(); if (sink) { sinks.push(sink); } }
        catch (caught) { diagnostics.push({ code: "observer-fault", message: String(hostError(caught)), stack: caught?.stack ?? "" }); }
    }
    return { sinks, diagnostics };
}

function openProgress(headless, build = [openPanel]) {
    if (headless) { return createProgress([]); }
    const { sinks, diagnostics } = progressSurfaces(build);
    const progress = createProgress(sinks);
    progress.diagnostics.push(...diagnostics);
    return progress;
}

module.exports = { openProgress };
