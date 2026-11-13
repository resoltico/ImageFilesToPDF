"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const table = ["| `mode` | PDF files |", "| `paperSize` | Paper size |", "| `orientation` | Orientation |",
    "| `resolutionLimit` | Maximum resolution |", "| `quality` | JPEG quality |", "| `background` | Page background |"];

test("settings documentation rejects missing and reordered rows", async () => {
    const { checkSettingsTable } = await import("../../../tools/lint/settings-docs.mjs");
    assert.doesNotThrow(() => checkSettingsTable("guide", table.join("\n")));
    assert.throws(() => checkSettingsTable("guide", table.slice(1).join("\n")), /must include/u);
    assert.throws(() => checkSettingsTable("guide", [table[1], table[0], ...table.slice(2)].join("\n")), /order must match/u);
});
