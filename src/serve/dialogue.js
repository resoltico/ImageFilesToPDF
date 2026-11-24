"use strict";

const { message } = require("../core/messages.js");
const { UserCanceled } = require("../core/errors.js");

const ANSWERS = new Map([
    ["review", new Set(["continue", "cancel"])],
    ["settings-needed", new Set(["settings"])],
    ["settings-invalid", new Set(["settings"])]
]);

function dialogue(commands) {
    let pending = null;
    return {
        expect(type) {
            commands.checkpoint();
            const answers = ANSWERS.get(type);
            if (pending || !answers) { throw new Error(message("engineMessageOrder")); }
            const waiter = Promise.withResolvers();
            waiter.promise.catch(() => undefined);
            pending = { answers, ...waiter };
            return waiter.promise;
        },
        receive(answer) {
            if (!pending?.answers.has(answer.type)) { throw new Error(message("engineMessageOrder")); }
            const { resolve } = pending;
            pending = null;
            resolve(answer);
        },
        stop() {
            commands.requestStop();
            pending?.reject(new UserCanceled());
            pending = null;
        }
    };
}

module.exports = { dialogue };
