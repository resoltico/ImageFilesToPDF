"use strict";
const { createProgress } = require("../progress.js");
const { noImagesOutcome } = require("../../core/outcomes.js");

function commandLineInteraction(invocation, { progress = createProgress([]) } = {}) {
    return { progress, collect: () => invocation,
        settings: () => invocation.settings, noImages: noImagesOutcome, present: (result) => result };
}
module.exports = { commandLineInteraction };
