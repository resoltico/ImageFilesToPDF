"use strict";
const { hostError } = require("./cancellation.js");

const { createProgress } = require("./progress.js");
const { openPanel } = require("./panel.js");

/*
 * The host's own object, written in its own words. Its presence is the whole
 * of what can be checked: a host that accepts all four assignments and draws
 * nothing is indistinguishable from one that draws them, which is the reason
 * the panel exists.
 */
function jxaProgress(host = globalThis.Progress) {
    if (!host) {
        return null;
    }

    return {
        start(total) {
            host.totalUnitCount = total;
            host.completedUnitCount = 0;
        },

        report(done, description, detail) {
            host.completedUnitCount = done;
            host.description = description;
            host.additionalDescription = detail;
        },

        pause() {
            host.totalUnitCount = 0;
        },

        // A bar left part-filled after the run is over goes on saying there is
        // work outstanding. Zero is what hides it.
        close() {
            host.totalUnitCount = 0;
        }
    };
}

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

function openProgress(headless, build = [openPanel, jxaProgress]) {
    if (headless) { return createProgress([]); }
    const { sinks, diagnostics } = progressSurfaces(build);
    const progress = createProgress(sinks);
    progress.diagnostics.push(...diagnostics);
    return progress;
}

module.exports = { jxaProgress, openProgress };
