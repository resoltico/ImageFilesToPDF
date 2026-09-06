"use strict";

/*
 * Capability probes for the external tools.
 *
 * Presence is not enough. pdfcpu changed how it parses flags, so a build that
 * is installed and on PATH can still reject `--mode=strict` and fail every run
 * at validation with a message that points at nothing. A version comparison
 * would be the wrong instrument: `--export-profile` is a backward-compatible
 * alias that newer libvips no longer advertises but still accepts, so the
 * question is whether this build takes the flags we use, not what it is called.
 *
 * Each probe therefore runs the real tool with the real flags against a path
 * that cannot exist. A tool that understands the flags fails on the missing
 * file; one that does not fails on the flag, and says so differently.
 */

const PROBE_IMAGE = "/nonexistent-image-files-to-pdf-preflight.png";
const PROBE_OUTPUT = "/nonexistent-image-files-to-pdf-preflight.v";
const PROBE_PDF = "/nonexistent-image-files-to-pdf-preflight.pdf";
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
        "srgb"
    ];
}

function buildPdfcpuProbeArgv(pdfcpuPath) {
    return [pdfcpuPath, "validate", "--mode=strict", PROBE_PDF];
}

/*
 * vips reports an unrecognised flag as "Unknown option --x" and a missing
 * input as a load failure, so only the former means the build is too old.
 */
function isVipsUsable(probeOutput) {
    return !/Unknown option/u.test(String(probeOutput));
}

/*
 * pdfcpu echoes "validating(mode=strict)" once it has understood the flag.
 * The older parser reads `--mode=strict` as a filename and complains that
 * "strict needs extension .pdf" instead.
 */
function isPdfcpuUsable(probeOutput) {
    return /mode=strict/u.test(String(probeOutput));
}

const INSTALL_COMMAND = "brew install vips pdfcpu";
const HOMEBREW_URL = "https://brew.sh";

function describeProblem(problem) {
    if (problem.kind === "missing") {
        return `- ${problem.tool} is not installed.`;
    }

    return `- ${problem.tool} is installed but too old: it does not accept ` +
        `${problem.flags}.`;
}

/*
 * One message listing everything that is wrong, and one command that fixes it.
 * Reporting only the first problem makes the user install, retry, and discover
 * the next one.
 */
function describeSetupProblems(problems, hasHomebrew) {
    const remedy = hasHomebrew
        ? `Run this in Terminal:\n\n${INSTALL_COMMAND}`
        : `Install Homebrew first, from ${HOMEBREW_URL}\n\n` +
            `then run:\n\n${INSTALL_COMMAND}`;

    return `Setup needed.\n\n${problems.map(describeProblem).join("\n")}\n\n${remedy}`;
}

module.exports = {
    buildVipsProbeArgv,
    buildPdfcpuProbeArgv,
    isVipsUsable,
    isPdfcpuUsable,
    describeSetupProblems
};
