"use strict";
const { hostError } = require("../../../../../src/host/cancellation.js");

const { createProgress } = require("../../../../../src/application/progress.js");
const { openPanel } = require("../../../../../src/host/quick-action/panel.js");

// Optional progress surfaces contribute diagnostics when unavailable.
function progressSurfaces(build) {
    const sinks = [];
    const diagnostics = [];
    for (const open of build) {
        try { const sink = open(); if (sink) { sinks.push(sink); } }
        catch (caught) { diagnostics.push({ code: "observer-fault", message: String(hostError(caught)), stack: caught?.stack ?? "" }); }
    }
    return { sinks, diagnostics };
}

function openProgress(build = [openPanel]) {
    const { sinks, diagnostics } = progressSurfaces(build);
    const progress = createProgress(sinks, undefined, hostError);
    progress.diagnostics.push(...diagnostics);
    return progress;
}

module.exports = { openProgress };
