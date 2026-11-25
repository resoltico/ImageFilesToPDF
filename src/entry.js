"use strict";
const { runQuickAction } = require("./finder/quick-action/main.js");

// eslint-disable-next-line no-unused-vars -- The public Shortcuts bridge supplies both arguments.
function run(input, parameters) { return runQuickAction(input); }

module.exports = { run };
