"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { readFileSync } = require("node:fs");
const root = path.resolve(__dirname, "../..");

test("the command-line dependency graph never imports AppKit", () => {
    const visited = new Set();
    const pending = [path.join(root, "src/host/command-line/main.js")];
    while (pending.length > 0) {
        const file = pending.pop();
        if (!visited.has(file)) {
        visited.add(file);
        const source = readFileSync(file, "utf8");
        assert.doesNotMatch(source, /import\(["']AppKit["']\)/u, file);
        assert.equal(file.includes("/quick-action/"), false, file);
        for (const match of source.matchAll(/require\("(?<target>\.[^"]+)"\)/gu)) {
            pending.push(path.resolve(path.dirname(file), match.groups.target));
        }
        }
    }
    assert.ok(visited.size > 30, "the full use-case graph was traversed");
});
