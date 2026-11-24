"use strict";
const { buildPdfcpuMergeArgv } = require("./pdfcpu.js");
const MAX_MERGE_INPUTS = 32;

function mergeGroups(pdfcpu, output, paths, { fits, toolPath }) {
    const fitsGroup = (group) => fits(buildPdfcpuMergeArgv(pdfcpu, toolPath(output), group.map(toolPath)));
    const groups = [];
    let group = [];
    for (const path of paths) {
        if (!fitsGroup([path])) { throw new Error("A PDF merge argument exceeds the command budget."); }
        if (group.length > 0 && (group.length >= MAX_MERGE_INPUTS || !fitsGroup([...group, path]))) {
            groups.push(group); group = [];
        }
        group.push(path);
    }
    if (group.length > 0) { groups.push(group); }
    return groups;
}
module.exports = { mergeGroups };
