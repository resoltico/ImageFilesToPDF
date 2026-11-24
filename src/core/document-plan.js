"use strict";
const { PDF_MODE } = require("./settings.js");
const { outputNameForCombined, outputNameForSeparate, sourceExtension } = require("./naming.js");

/** Name groups are filesystem equivalence classes, supplied by the host. */
function documentPlan(settings, sources, timestamp, { nameGroups, separateName = outputNameForSeparate } = {}) {
    if (sources.length === 0) { return []; }
    if (settings.mode !== PDF_MODE.separate) {
        const name = sources.length === 1 ? separateName(sources[0]) : outputNameForCombined(timestamp);
        return [{ sources, destination: sources[0].folder + name }];
    }
    if (!Array.isArray(nameGroups) || nameGroups.length !== sources.length ||
        Array.from(nameGroups).some((group) => !Number.isSafeInteger(group) || group < 0)) {
        throw new TypeError("Destination name groups must identify every source.");
    }
    const extensions = new Map();
    for (const [index, source] of sources.entries()) {
        const group = nameGroups[index];
        if (!extensions.has(group)) { extensions.set(group, new Set()); }
        extensions.get(group).add(sourceExtension(source.originalName));
    }
    return sources.map((source, index) => ({ sources: [source],
        destination: source.folder + separateName(source, extensions.get(nameGroups[index]).size > 1) }));
}
module.exports = { documentPlan };
