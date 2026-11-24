"use strict";
const { RUN_OUTCOME } = require("../core/outcomes.js");

const INVALID_REQUEST = 2;
const SETUP_FAILED = 3;
const EXIT_CODES = new Map([
    [RUN_OUTCOME.complete, 0],
    [RUN_OUTCOME.incomplete, 1],
    [RUN_OUTCOME.canceled, 1],
    [RUN_OUTCOME.invalidRequest, INVALID_REQUEST],
    [RUN_OUTCOME.setupFailed, SETUP_FAILED]
]);

function exitCode(result) {
    const status = EXIT_CODES.get(result.state);
    if (status === undefined) { throw new Error(`Unknown run outcome: ${result.state}`); }
    return status;
}

module.exports = { exitCode };
