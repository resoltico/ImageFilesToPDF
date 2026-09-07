"use strict";

/*
 * Saying what the run is doing while it does it.
 *
 * Written to JavaScript for Automation's own Progress object rather than to a
 * window this code puts on screen. The two were weighed by what happens when
 * each is wrong: an assignment to Progress cannot open a window, cannot raise
 * the process activation policy and put a Dock icon up in the middle of an
 * action, and cannot pump a run loop underneath a host that is driving this
 * script. If nothing is listening, nothing happens.
 *
 * An NSPanel can do all three, and whether it does is not something this
 * repository can measure: a Shortcut cannot be created from the command line,
 * so the probe that established the settings form presents cleanly cannot be
 * repeated here without someone running it by hand. Unverified and silent is
 * a fair trade; unverified and visible is not.
 *
 * Which means the honest statement is that whether the host shows any of this
 * is unmeasured. QA.md says so, and says how to find out. The sink is a
 * parameter so that answer can change without touching a single call site.
 */

/*
 * Reports that go nowhere: a headless run, a job assembled before the count
 * is known, a host with no Progress to write to.
 */
const SILENT = Object.freeze({
    file() {
        return undefined;
    },
    phase() {
        return undefined;
    }
});

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
        }
    };
}

/*
 * The count is of the images that were accepted, not of PDFs written or of
 * work elapsed: it is the only number this action knows in advance.
 */
function createProgress(total, sink = jxaProgress()) {
    let done = 0;
    let name = "";

    const say = (description) => {
        try {
            sink.report(done, description, `${done} of ${total} — ${name}`);
        } catch {
            // A report about the work must not become part of the work.
        }
    };

    try {
        sink.start(total);
    } catch {
        // No Progress on this host, or one that will not take a total.
        return SILENT;
    }

    return {
        file(index, originalName) {
            done = index;
            // A name is a line of the description, so it is kept to one.
            name = String(originalName).replace(/\s+/gu, " ");
            say("Preparing");
        },

        phase: say
    };
}

module.exports = { createProgress, jxaProgress, SILENT };
