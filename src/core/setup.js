"use strict";
const { message } = require("./messages.js");

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

module.exports = { MINIMUM_PDFCPU_VERSION, describeSetupProblems };
