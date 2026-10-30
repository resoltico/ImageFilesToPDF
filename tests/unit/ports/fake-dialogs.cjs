"use strict";

/* Test-only runaway protection. A mutant rejecting every answer must fail a
 * test, not spend the entire campaign asking a scripted person forever. The
 * real UI has no deadline and remains free to accept any number of retries. */
function boundedDialog(reply, limit = 32) {
    let calls = 0;

    return (message, options) => {
        if (calls >= limit) {
            throw new Error("Unexpected dialog loop in the scripted test host.");
        }
        calls += 1;

        return reply(message, options);
    };
}

module.exports = { boundedDialog };
