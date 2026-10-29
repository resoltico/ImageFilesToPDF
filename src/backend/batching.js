"use strict";

const { shellQuote } = require("./shell.js");
const { utf8Length } = require("../core/utf8.js");

/* UTF-8 shell-quoted argv budgeting; the application owns page/data batching. */
const COMMAND_BUDGET_BYTES = 131072;

function commandLengthOf(argv) {
    return argv.reduce(
        (total, argument) => total + utf8Length(shellQuote(argument)) + 1,
        0
    );
}

module.exports = { commandLengthOf, COMMAND_BUDGET_BYTES };
