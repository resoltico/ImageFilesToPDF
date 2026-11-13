"use strict";
const { PDF_MODE } = require("./settings.js");
const { outputNameForCombined, outputNameForSeparate } = require("./naming.js");

/** Name groups are filesystem equivalence classes, supplied by the host. */
function documentPlan(settings, sources, timestamp, nameGroups) {
    if (sources.length === 0) { return []; }
    if (settings.mode !== PDF_MODE.separate) {
        const name = sources.length === 1 ? outputNameForSeparate(sources[0]) : outputNameForCombined(timestamp);
        return [{ sources, destination: sources[0].folder + name }];
    }
    if (!Array.isArray(nameGroups) || nameGroups.length !== sources.length ||
        Array.from(nameGroups).some((group) => !Number.isSafeInteger(group) || group < 0)) {
        throw new TypeError("Destination name groups must identify every source.");
    }
    const counts = new Map();
    for (const group of nameGroups) { counts.set(group, (counts.get(group) ?? 0) + 1); }
    return sources.map((source, index) => ({ sources: [source],
        destination: source.folder + outputNameForSeparate(source, counts.get(nameGroups[index]) > 1) }));
}
module.exports = { documentPlan };
