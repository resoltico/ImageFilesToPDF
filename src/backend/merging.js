"use strict";
const { buildPdfcpuMergeArgv } = require("./pdfcpu.js");
const { commandLengthOf, COMMAND_BUDGET_BYTES } = require("./batching.js");
const MAX_MERGE_INPUTS = 32;

function mergeGroups(pdfcpu, output, paths, budget = COMMAND_BUDGET_BYTES) {
    const groups = [];
    let group = [];
    for (const path of paths) {
        if (commandLengthOf(buildPdfcpuMergeArgv(pdfcpu, output, [path])) > budget) { throw new Error("A PDF merge argument exceeds the command budget."); }
        if (group.length > 0 && (group.length >= MAX_MERGE_INPUTS || commandLengthOf(buildPdfcpuMergeArgv(pdfcpu, output, [...group, path])) > budget)) {
            groups.push(group); group = [];
        }
        group.push(path);
    }
    if (group.length > 0) { groups.push(group); }
    return groups;
}
module.exports = { mergeGroups };
