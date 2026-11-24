"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { MESSAGES, message } = require("../../../src/core/messages.js");

test("every catalog form supplies visible wording and replaces its declared placeholders", () => {
    for (const [id, forms] of Object.entries(MESSAGES)) {
        const templates = typeof forms === "string" ? [[null, forms]] : [[1, forms.one], [2, forms.other]];
        for (const [count, template] of templates) {
            assert.match(template, /\S/u, id);
            const names = Array.from(template.matchAll(/\{(?<name>[A-Za-z]\w*)\}/gu), ({ groups }) => groups.name);
            const params = Object.fromEntries(names.map((name) => [name, name === "count" ? count : `<${name}>`]));
            const rendered = message(id, params);
            assert.doesNotMatch(rendered, /[{}]/u, id);
            for (const value of Object.values(params)) { assert.ok(rendered.includes(String(value)), id); }
        }
    }
});

test("parameter values are inserted literally without cascading substitution", () => {
    assert.equal(message("fileIssue", { path: "{reason}", reason: "$&" }), "{reason}: $&");
});
