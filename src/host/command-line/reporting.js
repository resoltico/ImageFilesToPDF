"use strict";
const { SETTINGS_SCHEMA } = require("../../core/settings.js");
const { reportText } = require("../../core/run-report.js");
const { writeReceipt, exitCli } = require("./receipt.js");
const INVALID_EXIT = 2;
const SETUP_EXIT = 3;
function exitCode(result) {
    if (result.state === "canceled") { return 1; }
    if (result.issues.some((issue) => issue.stage === "setup")) { return SETUP_EXIT; }
    if (result.state === "invalid") { return INVALID_EXIT; }
    return result.state === "complete" ? 0 : 1;
}

function actualTypeLabel(type) {
    if (type === "null") { return "null"; }
    return `${["array", "object"].includes(type) ? "an" : "a"} ${type}`;
}

function settingsIssueMessage(issue) {
    if (issue.stage !== "settings" || !issue.field) { return issue.message; }
    const rule = Object.hasOwn(SETTINGS_SCHEMA, issue.field) ? SETTINGS_SCHEMA[issue.field] : null;
    const label = rule ? `\`${issue.field}\`` : JSON.stringify(issue.field);
    if (issue.diagnostic?.missing) { return `${label} is missing.`; }
    if (issue.diagnostic?.expectedType) {
        return `${label} must be a JSON ${issue.diagnostic.expectedType}, not ${actualTypeLabel(issue.diagnostic.actualType)}.`;
    }
    if (issue.code === "unknown") { return `${label} is not a recognized setting.`; }
    const prefix = rule ? `${rule.name} ` : "";
    return prefix && issue.message.startsWith(prefix)
        ? `${label} ${issue.message.slice(prefix.length)}` : `${label}: ${issue.message}`;
}

function commandLineResult(result) {
    return { ...result, issues: result.issues.map((issue) => ({ ...issue, message: settingsIssueMessage(issue) })) };
}

function reportHeadless(result, write = writeReceipt, exit = exitCli) {
    const reported = commandLineResult(result);
    write(`${JSON.stringify(reported)}\n`);
    write(`${reportText(reported)}\n`, undefined, true);
    return exit(exitCode(reported));
}

module.exports = { reportHeadless };
