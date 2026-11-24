"use strict";
const { failedRun } = require("../../../../../src/core/outcomes.js");
const { isUserCanceled } = require("../../../../../src/core/errors.js");
const { hostError } = require("../../../../../src/finder/cancellation.js");
const { execute, application } = require("../main.js");
const { openProgress } = require("./surfaces.js");
const { showCompletion } = require("../../../../../src/finder/quick-action/completion.js");
const { quickActionInteraction } = require("./interaction.js");

async function run(input) {
    const app = application();
    const progress = openProgress();
    try {
        try { return await execute(app, input, { interaction: quickActionInteraction(app, progress) }); }
        finally { progress.close(); }
    } catch (caught) {
        const error = hostError(caught);
        if (!isUserCanceled(error)) { showCompletion(app, failedRun(error, caught?.outcome)); }
        return undefined;
    }
}
module.exports = { run };
