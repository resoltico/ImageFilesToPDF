"use strict";
const { reportText } = require("../../core/run-report.js");
const { writeReceipt, exitCli } = require("./receipt.js");
const INVALID_EXIT = 2;
const SETUP_EXIT = 3;
function exitCode(result) {
    if (result.issues.some((issue) => issue.stage === "setup")) { return SETUP_EXIT; }
    if (result.state === "invalid") { return INVALID_EXIT; }
    return result.state === "complete" ? 0 : 1;
}

function reportHeadless(result, write = writeReceipt, exit = exitCli) {
    write(`${JSON.stringify(result)}\n`);
    write(`${reportText(result)}\n`, undefined, true);
    return exit(exitCode(result));
}

module.exports = { reportHeadless };
