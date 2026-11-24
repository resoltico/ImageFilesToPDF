"use strict";
const { runQuickAction } = require("./host/quick-action/main.js");

// The public Shortcuts bridge supplies both arguments.
// eslint-disable-next-line no-unused-vars
function run(input, parameters) { return runQuickAction(input); }

module.exports = { run };
