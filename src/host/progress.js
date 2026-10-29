"use strict";
const { hostError } = require("./cancellation.js");

const { isUserCancelled, UserCancelled } = require("../core/errors.js");

/*
 * Saying what the run is doing while it does it: the counting, the wording,
 * and where a stop takes effect. What shows any of it is surfaces.js.
 *
 * Two numbers are reported side by side and they are not the same number.
 * `done` is work that has finished; the label counts images, because "2 of 1"
 * in front of somebody waiting is nonsense whatever it is drawn beside.
 *
 * Two rules hold the rest of it up. The loop that owns an image opens and
 * closes its unit, and nothing else counts. And a report of what is about to
 * happen may stop the run, while a report of what has happened may not.
 */

function broadcast(sinks, state) {
    const failed = new Set();
    return (use, teardown = false) => {
        for (const sink of sinks) {
            if (teardown || !failed.has(sink)) {
                try {
                    use(sink);
                } catch (caught) {
                    const error = hostError(caught);
                    // Record the fault without unwinding from a publication.
                    if (isUserCancelled(error)) { state.stopped = true; }
                    else {
                        failed.add(sink);
                        state.diagnostics.push({ code: "observer-fault", message: String(error), stack: error?.stack ?? "" });
                    }
                }
            }
        }
    };
}

/*
 * Saying what is about to happen is where a stop takes effect, and there is no
 * list of such places to keep right: they are wherever the code says what it
 * is about to do. Nothing has been done yet at any of them, so nothing is
 * lost by not doing it, and a stage added later becomes a checkpoint by
 * writing the line that makes it visible.
 *
 * Afterwards rather than before, which is not a detail: a host raises at the
 * assignment following the button, so the report that discovers a stop is the
 * one being made, and checking first would miss it.
 */
function announce(state, say) {
    say();

    if (state.stopped) {
        throw new UserCancelled();
    }
}

function reporting(state, say) {
    const headline = (text) => {
        state.description = text;
        announce(state, say);
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
            announce(state, say);
        },

        phase: headline,

        // What has happened, and the one report that may not stop the run:
        // unwinding past finished work throws away the account of it.
        finished(text) {
            state.done += 1;
            state.description = text;
            say();
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
            each((sink) => sink.close(), true);
        }
    };
}

/*
 * A reporter with no surfaces reports nowhere and can never be stopped: what a
 * headless run wants, and what a job starts with. There is no second way of
 * saying it.
 */
function createProgress(sinks) {
    const state =
        { images: 0, done: 0, description: "", detail: "", stopped: false, closed: false, diagnostics: [] };
    const each = broadcast(sinks, state);
    const say = () => each(
        (sink) => sink.report(state.done, state.description, state.detail)
    );

    return { ...reporting(state, say), ...lifecycle(state, each), diagnostics: state.diagnostics, requestStop() { state.stopped = true; } };
}

module.exports = { createProgress };
