"use strict";
const { failedRun } = require("../../core/outcomes.js");
const { isUserCanceled } = require("../../core/errors.js");
const { hostError } = require("../cancellation.js");
const { execute, application } = require("../main.js");
const { openProgress } = require("./surfaces.js");
const { showCompletion } = require("./completion.js");
const { quickActionInteraction } = require("./interaction.js");

function runQuickAction(input) {
    const app = application();
    const progress = openProgress();
    try {
        try { return execute(app, input, { interaction: quickActionInteraction(app, progress) }); }
        finally { progress.close(); }
    } catch (caught) {
        const error = hostError(caught);
        if (!isUserCanceled(error)) { showCompletion(app, failedRun(error, caught?.outcome)); }
        return undefined;
    }
}
module.exports = { runQuickAction };
