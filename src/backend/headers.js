"use strict";
const { OPTIONAL_FIELDS } = require("./metadata.js");

function buildHeaderArgv(tool, paths) { return [tool, "-a", ...paths]; }

function buildFieldArgv(tool, field, paths) { return [tool, "-f", field, ...paths]; }

/** Control characters in filenames require an isolated, unprefixed header response. */
function headerGroups(tool, paths, fits) {
    const within = (group) => fits(buildHeaderArgv(tool, group)) &&
        OPTIONAL_FIELDS.every((field) => fits(buildFieldArgv(tool, field, group)));
    const groups = [];
    let group = [];
    for (const path of paths) {
        if (!within([path])) { throw new Error("An image header argument exceeds the command budget."); }
        if (/[\r\n]/u.test(path)) {
            if (group.length > 0) { groups.push(group); group = []; }
            groups.push([path]);
        } else {
            if (group.length > 0 && !within([...group, path])) { groups.push(group); group = []; }
            group.push(path);
        }
    }
    if (group.length > 0) { groups.push(group); }
    return groups;
}

module.exports = { buildFieldArgv, buildHeaderArgv, headerGroups };
