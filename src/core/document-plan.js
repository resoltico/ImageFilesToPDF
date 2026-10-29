"use strict";
const { outputNameForCombined, outputNameForSeparate } = require("./naming.js");

function documentPlan(settings, sources, timestamp) {
    if (sources.length === 0) { return []; }
    const groups = settings.mode === "separate" ? sources.map((source) => [source]) : [sources];
    return groups.map((group) => ({ sources: group, destination: group[0].folder +
        (settings.mode === "separate" ? outputNameForSeparate(group[0], timestamp) : outputNameForCombined(timestamp)) }));
}
module.exports = { documentPlan };
