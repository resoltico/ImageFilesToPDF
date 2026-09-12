"use strict";

const { isSeparateMode } = require("../core/settings.js");

/*
 * Saying what the run is doing while it does it: the counting and the wording,
 * with no knowledge of where either is displayed. What displays them is
 * surfaces.js, and there is more than one.
 *
 * Two numbers are reported side by side and they are not the same number.
 * `done` is work that has finished, which is what Apple says
 * completedUnitCount holds; the label counts images, because "2 of 1" in front
 * of somebody waiting is nonsense whatever the counter underneath it means. A
 * combined run of one photograph has two units in it -- the image, and the PDF
 * it becomes -- and one image.
 *
 * Who moves the count is one rule, and it is the rule the old code did not
 * have: the loop that owns an image opens and closes its unit, and nothing
 * else counts. Publication used to be the only thing that advanced it, so a
 * separate run whose second image failed ended at 2 of 3, and one where all
 * three failed ended at 0 of 3 with the label reading "3 of 3".
 */

function nothing() {
    return undefined;
}

/*
 * Reports that go nowhere: a headless run, a job assembled before the count is
 * known, a host with nothing at all to report to.
 */
const SILENT = Object.freeze({
    expect: nothing,
    beginning: nothing,
    about: nothing,
    phase: nothing,
    finished: nothing,
    pause: nothing,
    close: nothing
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

/*
 * Every surface gets every report, and one that refuses does not stop the
 * others. They are not alternatives: the host's own Progress object is
 * presented by Script Editor and by an applet, and the panel is what a
 * Shortcut can show, and a run may be either.
 */
function broadcast(sinks) {
    return (use) => {
        for (const sink of sinks) {
            try {
                use(sink);
            } catch {
                // A report about the work must not become part of the work.
            }
        }
    };
}

function reporting(state, say) {
    const headline = (text) => {
        state.description = text;
        say();
    };

    return {
        beginning(index, originalName) {
            // A name is a line of the description, so it is kept to one.
            const name = String(originalName).replace(/\s+/gu, " ");

            state.detail = `${index} of ${state.images} — ${name}`;
            headline("Preparing");
        },

        /*
         * The detail line, replaced by something that is not a file. The last
         * stages of a combined run are about the PDF, and they used to be
         * reported beside whichever image happened to be prepared last.
         */
        about(summary) {
            state.detail = summary;
            say();
        },

        phase: headline,

        finished(text) {
            state.done += 1;
            headline(text);
        }
    };
}

function lifecycle(state, each) {
    return {
        /*
         * The second half of this object's life. It is alive before the images
         * have been counted, because finding them is itself worth saying, and
         * it has no total until they have been.
         */
        expect({ units, images }) {
            state.images = images;
            each((sink) => sink.start(units));
        },

        pause() {
            each((sink) => sink.pause());
        },

        close() {
            if (state.closed) {
                return;
            }

            state.closed = true;
            each((sink) => sink.close());
        }
    };
}

function createProgress(sinks) {
    if (sinks.length === 0) {
        return SILENT;
    }

    const state = { images: 0, done: 0, description: "", detail: "", closed: false };
    const each = broadcast(sinks);
    const say = () => each(
        (sink) => sink.report(state.done, state.description, state.detail)
    );

    return { ...reporting(state, say), ...lifecycle(state, each) };
}

module.exports = { createProgress, unitsOf, SILENT };
