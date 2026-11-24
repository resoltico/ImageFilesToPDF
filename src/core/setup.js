"use strict";
const { issueMessage } = require("./messages.js");

const MINIMUM_PDFCPU_VERSION = "0.16.4";
const INSTALL_HINT = {
    darwin: "toolInstallDarwin", linux: "toolInstallLinux", win32: "toolInstallWindows"
};

function toolInstallHint(platform) {
    if (!Object.hasOwn(INSTALL_HINT, platform)) { throw new Error("Unknown setup platform."); }
    return INSTALL_HINT[platform];
}

function setupToolProblem(code, tool, override) {
    if (override) {
        const failure = tool === "pdfcpu" ? "toolOverridePdfcpuUnusable" : "toolOverrideUnusableName";
        return issueMessage(code, "setup", code === "override-invalid" ? "toolOverrideInvalidName" : failure,
            { variable: override.variable, value: JSON.stringify(override.value), tool, minimum: MINIMUM_PDFCPU_VERSION });
    }
    if (code === "tool-missing") { return issueMessage(code, "setup", "toolMissingFromPath", { name: tool }); }
    return issueMessage(code, "setup", tool === "pdfcpu" ? "pdfcpuUnusable" : "toolUnusable", { name: tool, minimum: MINIMUM_PDFCPU_VERSION });
}

module.exports = { MINIMUM_PDFCPU_VERSION, setupToolProblem, toolInstallHint };
