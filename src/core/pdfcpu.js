"use strict";

const { fixed2 } = require("./numbers.js");

/*
 * The commands that turn prepared pages into a PDF, and the one question
 * asked of a PDF afterwards.
 *
 * pdfcpu changed how it parses flags between releases, which is why the
 * preflight probes them rather than comparing versions: an older build is
 * installed, on PATH, and rejects --mode=strict on every run with an error
 * that points nowhere.
 */

function buildPdfcpuImportArgv(pdfcpuPath, outputPath, pagePaths, geometry) {
    if (!pagePaths || pagePaths.length === 0) {
        throw new Error("At least one prepared page is required.");
    }

    const description = [
        `dim:${fixed2(geometry.widthPoints)} ${fixed2(geometry.heightPoints)}`,
        "pos:c",
        "sc:1 rel"
    ].join(", ");

    return [pdfcpuPath, "import", "--", description, outputPath].concat(
        pagePaths
    );
}

/*
 * pdfcpu parses flags with pflag, where a single dash introduces a cluster of
 * short flags: "-mode strict" is read as "-m ode", and "strict" is then taken
 * for a filename. The long form must also use "=", because "--mode strict" is
 * rejected as an unknown flag.
 */
function buildPdfcpuInfoArgv(pdfcpuPath, outputPath) {
    return [pdfcpuPath, "info", outputPath];
}

const PAGE_COUNT = /Page count:\s*(?<value>\d+)/u;

function readPageCountFrom(infoOutput) {
    const match = PAGE_COUNT.exec(String(infoOutput));

    return match ? Number(match.groups.value) : 0;
}

function buildPdfcpuValidateArgv(pdfcpuPath, outputPath) {
    return [pdfcpuPath, "validate", "--mode=strict", outputPath];
}

module.exports = {
    buildPdfcpuImportArgv,
    buildPdfcpuInfoArgv,
    readPageCountFrom,
    buildPdfcpuValidateArgv
};
