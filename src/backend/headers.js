"use strict";
const { OPTIONAL_FIELDS } = require("./metadata.js");
const { commandLengthOf, COMMAND_BUDGET_BYTES } = require("./batching.js");

function buildHeaderArgv(tool, paths) { return [tool, "-a", ...paths]; }

function buildFieldArgv(tool, field, paths) { return [tool, "-f", field, ...paths]; }

/** Control characters in filenames require an isolated, unprefixed header response. */
function headerGroups(tool, paths, budget = COMMAND_BUDGET_BYTES) {
    const prefix = Math.max(commandLengthOf(buildHeaderArgv(tool, [])),
        ...OPTIONAL_FIELDS.map((field) => commandLengthOf(buildFieldArgv(tool, field, []))));
    const groups = [];
    let group = [];
    let bytes = prefix;
    for (const path of paths) {
        const cost = commandLengthOf([path]);
        if (prefix + cost > budget) { throw new Error("An image header argument exceeds the command budget."); }
        if (/[\r\n]/u.test(path)) {
            if (group.length > 0) { groups.push(group); group = []; bytes = prefix; }
            groups.push([path]);
        } else {
            if (group.length > 0 && bytes + cost > budget) { groups.push(group); group = []; bytes = prefix; }
            group.push(path); bytes += cost;
        }
    }
    if (group.length > 0) { groups.push(group); }
    return groups;
}

module.exports = { buildFieldArgv, buildHeaderArgv, headerGroups };
