"use strict";
const { collectInvocation } = require("./input.js");
const { reviewSelection } = require("./settings-review.js");
const { chooseSettings } = require("./settings-form.js");
const { reportNoImages, reportResult } = require("./reporting.js");

function quickActionInteraction(app, progress) {
    return { progress, collect: (input) => collectInvocation(app, input),
        settings(context) {
            if (context.rejected.length > 0) { reviewSelection(app, context); }
            return chooseSettings(app, context);
        },
        noImages: (rejected) => reportNoImages(app, rejected), present: (result) => reportResult(app, result) };
}
module.exports = { quickActionInteraction };
