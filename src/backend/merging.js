"use strict";
const { buildPdfcpuMergeArgv } = require("./pdfcpu.js");
const MAX_MERGE_INPUTS = 32;

function mergeGroups(pdfcpu, output, paths, fits) {
    const groups = [];
    let group = [];
    for (const path of paths) {
        if (!fits(buildPdfcpuMergeArgv(pdfcpu, output, [path]))) { throw new Error("A PDF merge argument exceeds the command budget."); }
        if (group.length > 0 && (group.length >= MAX_MERGE_INPUTS || !fits(buildPdfcpuMergeArgv(pdfcpu, output, [...group, path])))) {
            groups.push(group); group = [];
        }
        group.push(path);
    }
    if (group.length > 0) { groups.push(group); }
    return groups;
}
module.exports = { mergeGroups };
