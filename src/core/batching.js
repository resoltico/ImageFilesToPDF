"use strict";

const { shellQuote } = require("./shell.js");
const { utf8Length } = require("./numbers.js");

/*
 * Splitting the pages of one PDF across several imports.
 *
 * Every page path goes on one command line, and a command line has a size.
 * Measured on macOS: ARG_MAX is 1 MiB, and a combined PDF of 8,000 pages was
 * accepted while 12,000 failed -- with "An error occurred.", which is nothing
 * a person can act on. Selecting ten thousand images by hand is unlikely;
 * selecting a folder that holds them is one click.
 *
 * pdfcpu appends to a PDF that already exists, in the order it is given the
 * pages, so the pages can be handed over in groups and there is no ceiling
 * left to hit. Measured: two imports of two pages each produce four pages in
 * the order they were imported.
 *
 * The budget is a fraction of that measured limit rather than the whole of it,
 * because execve counts the environment against the same allowance and this
 * code cannot see how large the environment is. It is spent on the arguments
 * as they will actually be written -- quoted, with the separators -- so a
 * batch adapts to how long the paths turn out to be instead of assuming.
 */
const COMMAND_BUDGET_BYTES = 131072;

function commandLengthOf(argv) {
    return argv.reduce(
        (total, argument) => total + utf8Length(shellQuote(argument)) + 1,
        0
    );
}

/*
 * The pages in groups, each small enough to hand to one command, and never
 * empty: a group of one page is as far as this can divide, and refusing that
 * would be refusing the page rather than the command.
 */
function place(state, page, available) {
    const cost = utf8Length(shellQuote(page)) + 1;
    const batch = state.batches.at(-1);

    if (batch.length > 0 && state.length + cost > available) {
        state.batches.push([page]);
        state.length = cost;

        return;
    }

    batch.push(page);
    state.length += cost;
}

function batchPages(pagePaths, fixedArgv, budget = COMMAND_BUDGET_BYTES) {
    const available = budget - commandLengthOf(fixedArgv);
    const state = { batches: [[]], length: 0 };

    for (const page of pagePaths) {
        place(state, page, available);
    }

    return state.batches.at(-1).length > 0 ? state.batches : [];
}

module.exports = { batchPages, commandLengthOf, COMMAND_BUDGET_BYTES };
