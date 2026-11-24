"use strict";
const { validateSettings } = require("../core/settings.js");
const { UserCanceled } = require("../core/errors.js");

function progressSink(send) {
    let total = 0;
    return {
        start(value) { total = value; },
        report(done, phase, detail) {
            send({ type: "phase", phase });
            send({ type: "progress", done, total, ...(detail ? { current: detail } : {}) });
        },
        pause() {
            // Review and settings events tell the client to pause.
        },
        close() {
            // The final receipt closes the client display.
        }
    };
}

async function review(context, ask) {
    if (context.rejected.length === 0) { return; }
    const answer = await ask({ type: "review", context });
    if (answer.type === "cancel") { throw new UserCanceled(); }
    if (answer.type !== "continue") { throw new Error("A selection review answer is required."); }
}

async function settings(context, ask) {
    await review(context, ask);
    let event = { type: "settings-needed", context };
    for (;;) {
        // eslint-disable-next-line no-await-in-loop -- The client corrects its answer before each resubmission.
        const answer = await ask(event);
        if (answer.type !== "settings") { throw new Error("Page settings are required."); }
        const result = validateSettings(answer.values);
        if (result.settings) { return result.settings; }
        event = { type: "settings-invalid", issues: result.issues };
    }
}

function interactions(send, ask) {
    return { sink: progressSink(send), settings: (context) => settings(context, ask) };
}

module.exports = { interactions };
