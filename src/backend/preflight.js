"use strict";

const { FAIL_ON_DAMAGE } = require("./commands.js");

/*
 * vips is probed with the required flags against a missing input. pdfcpu has
 * a release floor: version does not load or initialize user configuration.
 */

const { MINIMUM_PDFCPU_VERSION } = require("../core/setup.js");

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

/* Stable releases only; an unrecognized or prerelease version fails closed. */
function isPdfcpuUsable(probeOutput) {
    const match = /^version: v?(?<version>\d+\.\d+\.\d+)[ \t]*$/mu.exec(String(probeOutput));

    if (!match) {
        return false;
    }

    const actual = match.groups.version.split(".").map(Number);
    const minimum = MINIMUM_PDFCPU_VERSION.split(".").map(Number);

    for (const [index, part] of minimum.entries()) {
        if (actual[index] > part) { return true; }
        if (actual[index] < part) { return false; }
    }

    return true;
}

module.exports = {
    buildVipsProbeArgv,
    buildVipsheaderProbeArgv,
    VIPSHEADER_PROBE_IMAGE,
    isVipsheaderUsable,
    buildPdfcpuProbeArgv,
    isPdfcpuUsable
};
