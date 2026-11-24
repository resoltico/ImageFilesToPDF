"use strict";
const { formatList } = require("./formatting.js");
const { OperationError } = require("./errors.js");
const { issueMessage, issueMessages, message } = require("./messages.js");
const { FINDER_EXECUTABLES } = require("./executable-search.js");
const { RUN_OUTCOME } = require("./outcomes.js");

const MINIMUM_PDFCPU_VERSION = "0.16.4";
const INSTALL_HINT = {
    darwin: "toolInstallDarwin", linux: "toolInstallLinux", win32: "toolInstallWindows"
};

function setupIssue(code, wording, params, rendered = params) {
    return { ...issueMessage(code, "setup", wording, rendered), params };
}

function chosenExecutableIssue(name, path) {
    return setupIssue("chosen-executable-invalid", "chosenExecutableInvalid", { name, path });
}

function setupToolProblem(code, name, override) {
    if (override && Object.hasOwn(override, "path")) { return chosenExecutableIssue(name, override.path); }
    if (override && code === "override-invalid") {
        const params = { variable: override.variable, value: override.value, name };
        return setupIssue(code, "toolOverrideInvalidName", params, { ...params, value: JSON.stringify(params.value) });
    }
    const version = name === "pdfcpu" ? { minimum: MINIMUM_PDFCPU_VERSION } : {};
    if (override) {
        const params = { variable: override.variable, value: override.value, name, ...version };
        const wording = name === "pdfcpu" ? "toolOverridePdfcpuUnusable" : "toolOverrideUnusableName";
        return setupIssue(code, wording, params, { ...params, value: JSON.stringify(params.value) });
    }
    if (code === "tool-missing") { return setupIssue(code, "toolMissing", { name }); }
    return setupIssue(code, name === "pdfcpu" ? "pdfcpuUnusable" : "toolUnusable", { name, ...version });
}

function installHint(automatic, platform) {
    if (!Object.hasOwn(INSTALL_HINT, platform)) { throw new Error("Unknown setup platform."); }
    const vips = platform === "darwin" ? "vips" : "libvips";
    const packages = [...new Set(automatic.map(({ params }) => params.name === "pdfcpu" ? "pdfcpu" : vips))];
    const params = { platform, packages };
    const rendered = platform === "darwin" ? packages.join(" ") : formatList(packages.map((name) =>
        name === "pdfcpu" ? message("toolInstallStablePdfcpu") : name));
    return setupIssue("install-hint", INSTALL_HINT[platform], params, { packages: rendered });
}

function setupFailure(problems, platform) {
    const automatic = problems.filter(({ code, params }) =>
        code !== "chosen-executable-invalid" && !Object.hasOwn(params, "variable"));
    const issues = automatic.length > 0 ? [...problems, installHint(automatic, platform)] : problems;
    return new OperationError(issueMessages(issues), { issues });
}

function executableChoices({ state, issues }) {
    if (state !== RUN_OUTCOME.setupFailed) { return []; }
    const offered = new Set(issues.flatMap(({ code, params }) => {
        if (code === "runtime-unavailable") { return ["node"]; }
        if (["chosen-executable-invalid", "tool-missing", "tool-unusable"].includes(code)) { return [params.name]; }
        return [];
    }));
    return FINDER_EXECUTABLES.filter((name) => offered.has(name));
}

module.exports = { MINIMUM_PDFCPU_VERSION, setupToolProblem, setupFailure, chosenExecutableIssue, executableChoices };
