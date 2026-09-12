"use strict";

const { createProgress } = require("../../../src/runtime/progress.js");

/*
 * A run that is asked to stop at a chosen moment.
 *
 * Driven through the real reporter rather than a stub of it, because the
 * mechanism is the reporter: a surface raises, broadcast records it, and the
 * next report of what is about to happen raises UserCancelled. A stub that
 * threw where the test wanted it to throw would prove only that the test can
 * throw.
 *
 * What the surface does is what a host with a Stop button does -- the
 * assignment after the button is pressed raises -128.
 */
function stoppingSink(asked, said) {
    return {
        start: () => undefined,

        report(done, description, detail) {
            said.push(`${description} | ${detail}`);

            if (!asked(description, detail, done)) {
                return;
            }

            const error = new Error("User cancelled.");

            error.errorNumber = -128;

            throw error;
        },

        pause: () => undefined,
        close: () => undefined
    };
}

/*
 * `asked` is given each report as it is made. Returning true is the button
 * being pressed at that instant.
 */
function stoppingWhen(asked) {
    const said = [];

    return { said, progress: createProgress([stoppingSink(asked, said)]) };
}

const atPhase = (name) => (description) => description === name;

module.exports = { stoppingWhen, atPhase };
