"use strict";

const { FAIL_ON_DAMAGE } = require("./commands.js");

/*
 * vips is probed with the required flags against a missing input. pdfcpu has
 * a release floor: version does not load or initialize user configuration.
 */

const MINIMUM_PDFCPU_VERSION = "0.16.4";

const PROBE_IMAGE = "/nonexistent-image-files-to-pdf-preflight.png";
const PROBE_OUTPUT = "/nonexistent-image-files-to-pdf-preflight.v";
const PROBE_WIDTH = "10";

function buildVipsProbeArgv(vipsPath) {
    return [
        vipsPath,
        "thumbnail",
        PROBE_IMAGE,
        PROBE_OUTPUT,
        PROBE_WIDTH,
        "--size=down",
        "--export-profile",
        "srgb",
        FAIL_ON_DAMAGE
    ];
}

const VIPSHEADER_PROBE_IMAGE = "\\0211\\0120\\0116\\0107\\0015\\0012\\0032\\0012\\0000\\0000\\0000\\0015\\0111\\0110\\0104\\0122\\0000\\0000\\0000\\0001\\0000\\0000\\0000\\0001\\0010\\0002\\0000\\0000\\0000\\0220\\0167\\0123\\0336\\0000\\0000\\0000\\0014\\0111\\0104\\0101\\0124\\0170\\0234\\0143\\0120\\0016\\0357\\0004\\0000\\0001\\0244\\0001\\0004\\0360\\0075\\0155\\0310\\0000\\0000\\0000\\0000\\0111\\0105\\0116\\0104\\0256\\0102\\0140\\0202";

function buildVipsheaderProbeArgv(vipsheaderPath) {
    return [vipsheaderPath, "-f", "width"];
}

function isVipsheaderUsable(probeOutput) { return String(probeOutput).trim() === "1"; }

function buildPdfcpuProbeArgv(pdfcpuPath) {
    return [pdfcpuPath, "version"];
}

/*
 * vips reports an unrecognized flag as "Unknown option --x" and a missing
 * input as a load failure, so only the former means the build is too old.
 */
/*
 * Asserted rather than assumed: vips names the loader it reached for before
 * complaining that the file is not there, and it only gets that far once it
 * has accepted the flags. Asking instead that a particular complaint is
 * absent passes a vips that printed nothing at all because it crashed.
 */
function isVipsUsable(probeOutput) {
    return /VipsForeignLoad/u.test(String(probeOutput));
}

/* Stable releases only; an unrecognized or prerelease version fails closed. */
function isPdfcpuUsable(probeOutput) {
    const match = /^version: v(?<version>\d+\.\d+\.\d+)[ \t]*$/mu.exec(String(probeOutput));

    if (!match) {
        return false;
    }

    const actual = match.groups.version.split(".").map(Number);
    const minimum = MINIMUM_PDFCPU_VERSION.split(".").map(Number);

    for (let index = 0; index < minimum.length; index += 1) {
        if (actual[index] !== minimum[index]) {
            return actual[index] > minimum[index];
        }
    }

    return true;
}

const INSTALL_COMMAND = "brew install vips pdfcpu";
const HOMEBREW_URL = "https://brew.sh";

function describeProblem(problem) {
    if (problem.override) {
        return `- ${problem.override.name}=${JSON.stringify(problem.override.value)} is not usable as ${problem.tool}.`;
    }

    if (problem.kind === "missing") {
        return `- ${problem.tool} is not installed.`;
    }

    if (problem.tool === "vipsheader") { return "- vipsheader could not read the built-in PNG image."; }

    if (problem.tool === "pdfcpu") {
        return `- pdfcpu could not report a supported stable version. ` +
            `Version ${MINIMUM_PDFCPU_VERSION} or later is required.`;
    }

    return `- ${problem.tool} is installed but too old: it does not accept ` +
        `${problem.flags}.`;
}

/*
 * One message lists every problem and the installation or upgrade commands.
 * Reporting only the first problem makes the user install, retry, and discover
 * the next one.
 */
function describeSetupProblems(problems, hasHomebrew) {
    const automatic = problems.filter((problem) => !problem.override);
    const commands = automatic.some((problem) => problem.kind === "unusable")
        ? `${INSTALL_COMMAND}\nbrew upgrade vips pdfcpu`
        : INSTALL_COMMAND;
    const remedies = [];
    if (problems.some((problem) => problem.override)) { remedies.push("Fix or unset the named tool overrides, then try again."); }
    if (automatic.length > 0) {
        remedies.push(hasHomebrew
            ? `Run this in Terminal:\n\n${commands}`
            : `Install Homebrew first, from ${HOMEBREW_URL}\n\nthen run:\n\n${commands}`);
    }
    return `Setup needed.\n\n${problems.map(describeProblem).join("\n")}\n\n${remedies.join("\n\n")}`;
}

module.exports = {
    buildVipsProbeArgv,
    buildVipsheaderProbeArgv,
    VIPSHEADER_PROBE_IMAGE,
    isVipsheaderUsable,
    buildPdfcpuProbeArgv,
    isVipsUsable,
    isPdfcpuUsable,
    describeSetupProblems
};
