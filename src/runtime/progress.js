"use strict";

const { isUserCancelled } = require("../core/errors.js");

/*
 * Saying what the run is doing while it does it: the counting and the wording,
 * with no knowledge of where either is displayed. That is surfaces.js.
 *
 * Two numbers are reported side by side and they are not the same number.
 * `done` is work that has finished, which is what Apple says
 * completedUnitCount holds; the label counts images, because "2 of 1" in
 * front of somebody waiting is nonsense whatever the counter underneath it
 * means.
 *
 * Who moves the count is one rule: the loop that owns an image opens and
 * closes its unit, and nothing else counts. Publication used to be the only
 * thing that advanced it, so a separate run whose second image failed ended
 * at 2 of 3, and one where all three failed ended at 0 of 3.
 */

function nothing() {
    return undefined;
}

function never() {
    return false;
}

/*
 * Reports that go nowhere: a headless run, a job assembled before the count is
 * known, a host with nothing at all to report to.
 */
const SILENT = Object.freeze({
    stopped: never,
    expect: nothing,
    beginning: nothing,
    about: nothing,
    phase: nothing,
    finished: nothing,
    pause: nothing,
    close: nothing
});

/*
 * Every surface gets every report, and one that refuses does not stop the
 * others: they are presented by different hosts, not by one host twice.
 *
 * A surface can report two things by throwing and only one is about the
 * surface. "I could not show this" is not news. "The person asked you to
 * stop" is not about the display at all -- that is merely where it arrived --
 * and it used to be discarded along with it.
 */
function broadcast(sinks, state) {
    return (use) => {
        for (const sink of sinks) {
            try {
                use(sink);
            } catch (error) {
                /*
                 * Recorded rather than thrown on: letting it out would unwind
                 * the run from wherever the report was made, and one of those
                 * places is the middle of a publication, which owns a
                 * finished PDF and a name it has claimed. The loops ask
                 * between images, where stopping is safe.
                 */
                state.stopped ||= isUserCancelled(error);
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

        // The detail line, replaced by something that is not a file: the
        // last stages of a combined run are about the PDF.
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
        // Asked by the loops, between images; nothing else may act on it.
        stopped() {
            return state.stopped;
        },

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

    const state =
        { images: 0, done: 0, description: "", detail: "", stopped: false, closed: false };
    const each = broadcast(sinks, state);
    const say = () => each(
        (sink) => sink.report(state.done, state.description, state.detail)
    );

    return { ...reporting(state, say), ...lifecycle(state, each) };
}

module.exports = { createProgress, SILENT };
