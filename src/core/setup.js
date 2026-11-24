"use strict";
const { issueMessage, message } = require("./messages.js");

const MINIMUM_PDFCPU_VERSION = "0.16.4";
const HOMEBREW_URL = "https://brew.sh";

function problemReason(problem) {
    if (problem.kind === "missing") { return message("setupMissing", { tool: problem.tool }); }
    if (problem.tool === "vipsheader") { return message("setupVipsheaderUnusable"); }
    if (problem.tool === "pdfcpu") { return message("setupPdfcpuUnusable", { minimum: MINIMUM_PDFCPU_VERSION }); }
    return message("setupVipsUnusable", { tool: problem.tool, flags: problem.flags });
}

function describeProblem(problem) {
    const reason = problemReason(problem);
    const { override, tool } = problem;
    const detail = override ? message("setupOverrideUnusable", { override: `${override.name}=${JSON.stringify(override.value)}`, tool }) : "";
    return `- ${[detail, reason].filter(Boolean).join(" ")}`;
}

function describeSetupProblems(problems, hasHomebrew) {
    const automatic = problems.filter((problem) => !problem.override);
    const commands = [message("homebrewToolInstall")];
    if (automatic.some((problem) => problem.kind === "unusable")) { commands.push(message("homebrewToolUpgrade")); }
    const remedies = [];
    if (problems.some((problem) => problem.override)) { remedies.push(message("setupFixOverrides")); }
    if (automatic.length > 0) {
        remedies.push(message(hasHomebrew ? "setupRunInTerminal" : "setupInstallHomebrew", { url: HOMEBREW_URL, commands: commands.join("\n") }));
    }
    return [message("setupNeeded"), problems.map(describeProblem).join("\n"), remedies.join("\n\n")].join("\n\n");
}

const INSTALL_HINT = {
    darwin: "toolInstallDarwin", linux: "toolInstallLinux", win32: "toolInstallWindows"
};

function toolInstallHint(platform) {
    if (!Object.hasOwn(INSTALL_HINT, platform)) { throw new Error("Unknown setup platform."); }
    return INSTALL_HINT[platform];
}

function setupToolProblem(code, tool, override) {
    if (override) {
        return issueMessage(code, "setup", code === "override-invalid" ? "toolOverrideInvalidName" : "toolOverrideUnusableName",
            { variable: override.variable, value: JSON.stringify(override.value), tool });
    }
    if (code === "tool-missing") { return issueMessage(code, "setup", "toolMissingFromPath", { name: tool }); }
    return issueMessage(code, "setup", tool === "pdfcpu" ? "pdfcpuUnusable" : "toolUnusable", { name: tool, minimum: MINIMUM_PDFCPU_VERSION });
}

module.exports = { MINIMUM_PDFCPU_VERSION, describeSetupProblems, setupToolProblem, toolInstallHint };
