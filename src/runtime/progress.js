"use strict";

const { isUserCancelled, UserCancelled } = require("../core/errors.js");

/*
 * Saying what the run is doing while it does it: the counting, the wording,
 * and where a stop takes effect. Where any of it is shown is surfaces.js.
 *
 * Two numbers are reported side by side and they are not the same number.
 * `done` is work that has finished; the label counts images, because "2 of 1"
 * in front of somebody waiting is nonsense whatever it is drawn beside.
 *
 * Who moves the count is one rule: the loop that owns an image opens and
 * closes its unit, and nothing else counts. Publication used to be the only
 * thing that advanced it, so a separate run whose second image failed ended
 * at 2 of 3, and one where all three failed ended at 0 of 3.
 *
 * Where a stop takes effect is the other: a report of what is about to happen
 * may stop the run, and a report of what has happened may not.
 */

/*
 * Every surface gets every report, and one that refuses does not stop the
 * others: they are presented by different hosts, not by one host twice.
 *
 * A surface can report two things by throwing and only one is about the
 * surface. "I could not show this" is not news. "The person asked you to
 * stop" is not about the display -- that is merely where it arrived -- and it
 * used to be discarded along with it.
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

/*
 * Saying what is about to happen is where a stop takes effect, and there is no
 * list of such places to keep right: they are wherever the code says what it
 * is about to do. Nothing has been done yet at any of them, so nothing is
 * lost by not doing it, and a stage added later becomes a checkpoint by
 * writing the line that makes it visible.
 *
 * Afterwards rather than before, which is not a detail. A host raises at the
 * assignment that follows the button, so the report that discovers a stop is
 * the one being made -- checking first would miss it and carry on into the
 * very work it was announcing.
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

        /*
         * What has happened, and the one report that may not stop the run:
         * unwinding past finished work throws away the account of it. Each of
         * these is followed by the end of the run or by a `beginning`.
         */
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
            each((sink) => sink.close());
        }
    };
}

/*
 * A reporter with no surfaces reports nowhere and can never be stopped, which
 * is what a headless run wants and what a job assembled before its count is
 * known starts with. There is no second way of saying it.
 */
function createProgress(sinks) {
    const state =
        { images: 0, done: 0, description: "", detail: "", stopped: false, closed: false };
    const each = broadcast(sinks, state);
    const say = () => each(
        (sink) => sink.report(state.done, state.description, state.detail)
    );

    return { ...reporting(state, say), ...lifecycle(state, each) };
}

module.exports = { createProgress };
