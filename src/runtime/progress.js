"use strict";

const { isSeparateMode } = require("../core/settings.js");

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
    beginning() {
        return undefined;
    },
    finished() {
        return undefined;
    },
    phase() {
        return undefined;
    }
});

/*
 * What this run has to finish. Separate mode publishes one PDF per image, so
 * an image is a unit of work; combined mode prepares every image and then
 * publishes one PDF, which is a unit of its own -- and counting only the
 * images made a combined run report more finished work than it had.
 */
function unitsOf(settings, images) {
    return isSeparateMode(settings) ? images : images + 1;
}

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
 * A unit is a piece of work that has finished, which is what Apple says
 * completedUnitCount holds. It used to hold the number of the file about to
 * be worked on, so a job of one image reported itself complete before its
 * first inspection -- and stayed complete while the PDF was created,
 * validated and saved.
 *
 * Units and images are two counts, not one. A combined run prepares every
 * image and then publishes one PDF, which is a unit of work of its own:
 * counting only the images made a one-image job report 2 of 1 when it
 * finished, and reach 1 of 1 before the PDF had been created at all. The
 * label counts images, because "2 of 1" in front of a person waiting is
 * nonsense whatever the counter underneath it means.
 */
function createProgress(counts, sink = jxaProgress()) {
    const { units, images } = counts;
    let done = 0;
    let label = "";

    const say = (description) => {
        try {
            sink.report(done, description, label);
        } catch {
            // A report about the work must not become part of the work.
        }
    };

    try {
        sink.start(units);
    } catch {
        // No Progress on this host, or one that will not take a total.
        return SILENT;
    }

    return {
        beginning(index, originalName) {
            // A name is a line of the description, so it is kept to one.
            const name = String(originalName).replace(/\s+/gu, " ");

            label = `${index} of ${images} — ${name}`;
            say("Preparing");
        },

        finished(description) {
            done += 1;
            say(description);
        },

        phase: say
    };
}

module.exports = { createProgress, jxaProgress, unitsOf, SILENT };
