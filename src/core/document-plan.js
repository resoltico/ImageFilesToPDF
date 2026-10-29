"use strict";
const { outputNameForCombined, outputNameForSeparate } = require("./naming.js");

function documentPlan(settings, sources, timestamp) {
    if (sources.length === 0) { return []; }
    if (settings.mode !== "separate") { return [{ sources, destination: sources[0].folder + outputNameForCombined(timestamp) }]; }
    const names = sources.map((source) => source.folder + outputNameForSeparate(source));
    const counts = new Map();
    for (const name of names) { counts.set(name, (counts.get(name) ?? 0) + 1); }
    return sources.map((source, index) => ({ sources: [source],
        destination: source.folder + outputNameForSeparate(source, counts.get(names[index]) > 1) }));
}
module.exports = { documentPlan };
