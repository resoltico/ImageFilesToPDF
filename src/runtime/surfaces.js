"use strict";

const { createProgress, SILENT } = require("./progress.js");
const { openPanel } = require("./panel.js");

/*
 * Where a report is displayed, and how a run acquires somewhere to display it.
 *
 * The action used to write to one surface and assume it was seen. JavaScript
 * for Automation's Progress object is presented by Script Editor, by a script
 * applet and by the system script menu; this action ships as a Shortcut, which
 * is none of those, and the assignments succeeded and nobody saw anything.
 *
 * So there are two surfaces and they are both written to. A surface that
 * cannot be established returns null and is left out; if none can be, the run
 * reports to SILENT, and that is now something measured about the host rather
 * than something assumed about it.
 */

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
            return undefined;
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
function openProgress(headless, build = [openPanel, jxaProgress]) {
    if (headless) {
        return SILENT;
    }

    try {
        return createProgress(build.map((open) => open()).filter(Boolean));
    } catch {
        return SILENT;
    }
}

module.exports = { jxaProgress, openProgress };
