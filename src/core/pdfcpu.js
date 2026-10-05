"use strict";

const { fixed2, positiveIntegerFrom } = require("./numbers.js");

/*
 * The commands that turn prepared pages into a PDF, and the one question
 * asked of a PDF afterwards.
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

    return [pdfcpuPath, "import", "--conf", "disable", "--", description, outputPath].concat(
        pagePaths
    );
}

function buildPdfcpuInfoArgv(pdfcpuPath, outputPath) {
    return [pdfcpuPath, "info", "--conf", "disable", outputPath];
}

const PAGE_COUNT = /^\s*Page count:[ \t]*(?<value>[^\r\n]*)$/gmu;

function readPageCountFrom(infoOutput) {
    const matches = [...String(infoOutput).matchAll(PAGE_COUNT)];

    return matches.length === 1 ? positiveIntegerFrom(matches[0].groups.value) : 0;
}

function buildPdfcpuValidateArgv(pdfcpuPath, outputPath) {
    return [pdfcpuPath, "validate", "--conf", "disable", "--mode=strict", outputPath];
}

module.exports = {
    buildPdfcpuImportArgv,
    buildPdfcpuInfoArgv,
    readPageCountFrom,
    buildPdfcpuValidateArgv
};
