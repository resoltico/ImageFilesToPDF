import errors from "../src/core/messages.js";
import outcomes from "../src/core/outcomes.js";
import report from "../src/core/run-report.js";
import runtime from "../src/core/version.js";
import status from "../src/cli/exit-code.js";

const { issueMessage } = errors;
const { runOutcome } = outcomes;
const { reportText } = report;
const { MINIMUM_NODE_VERSION, supportsNode } = runtime;
const { exitCode } = status;

export function guardedBundle(source) {
    const issue = issueMessage("runtime-unsupported", "setup", "runtimeUnsupported", { minimum: MINIMUM_NODE_VERSION });
    const outcome = runOutcome([], [], [issue]);
    const preamble = `"use strict";
const MINIMUM_NODE_VERSION = ${JSON.stringify(MINIMUM_NODE_VERSION)};
${supportsNode.toString()}
if (!supportsNode(process.versions.node)) {
    const { writeSync } = require("node:fs");
    process.exitCode = ${exitCode(outcome)};
    try { writeSync(2, ${JSON.stringify(`${reportText(outcome)  }\n`)}); } catch { process.exitCode = 1; }
    try { writeSync(1, ${JSON.stringify(`${JSON.stringify(outcome)  }\n`)}); } catch { process.exitCode = 1; }
} else {
    const boot = Function("require", "module", "exports", "__filename", "__dirname", ${JSON.stringify(source)});
    boot(require, module, exports, __filename, __dirname);
}
`;
    return preamble;
}
