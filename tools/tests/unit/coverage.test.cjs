"use strict";

/*
 * The coverage rule: every file in scope loaded, every line, branch and
 * function run, judged on lcov records that may come from several machines.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const load = () => import("../../../tools/coverage.mjs");
const ROOT = path.resolve("/checkout");
const at = (relative) => path.join(ROOT, ...relative.split("/"));

function lcov(file, { lines = [], branches = [], functions = [] }) {
    return [
        `SF:${at(file)}`,
        ...functions.flatMap(([line, name]) => [`FN:${line},${name}`]),
        ...functions.map(([, name, hits]) => `FNDA:${hits},${name}`),
        ...branches.map(([line, block, hits]) => `BRDA:${line},${block},0,${hits}`),
        ...lines.map(([line, hits]) => `DA:${line},${hits}`),
        "end_of_record"
    ].join("\n");
}

test("a wholly covered scope has no gaps", async () => {
    const { parseLcov, coverageGaps } = await load();
    const record = lcov("src/a.js", { lines: [[1, 1], [2, 3]], branches: [[2, 0, 1], [2, 1, 2]], functions: [[1, "a", 1]] });
    assert.deepEqual(coverageGaps(parseLcov(record, ROOT), ["src/a.js"]), []);
});

test("an unloaded file, a line, a branch and a function short of coverage are each named", async () => {
    const { parseLcov, coverageGaps } = await load();
    const record = lcov("src/a.js", {
        lines: [[1, 1], [5, 0]], branches: [[3, 0, 1], [3, 1, 0], [4, 2, "-"]], functions: [[2, "helper, with comma", 0]]
    });
    assert.deepEqual(coverageGaps(parseLcov(`${record}\r\n`, ROOT), ["src/b.js", "src/a.js"]), [
        "src/a.js:2: function helper, with comma never called",
        "src/a.js:3: branch not taken",
        "src/a.js:4: branch not taken",
        "src/a.js:5: line not run",
        "src/b.js: never loaded by a test"
    ]);
});

test("files outside the scope do not count, and paths are made relative to the checkout", async () => {
    const { parseLcov, coverageGaps } = await load();
    const parsed = parseLcov(lcov("tests/helper.cjs", { lines: [[1, 0]] }), ROOT);
    assert.deepEqual([...parsed.keys()], ["tests/helper.cjs"]);
    assert.deepEqual(coverageGaps(parsed, []), []);
});

test("records from several machines merge: run anywhere is run", async () => {
    const { parseLcov, mergeCoverage, coverageGaps } = await load();
    // Each machine took one of the two branches on line 7, known on both by
    // their place on the line though Node numbered them differently.
    const first = parseLcov(lcov("src/a.js", { lines: [[7, 1], [9, 0]], branches: [[7, 10, 1], [7, 11, 0]], functions: [[6, "f", 1]] }), ROOT);
    const second = parseLcov(lcov("src/a.js", { lines: [[7, 1], [9, 2]], branches: [[7, 4, 0], [7, 5, 1]], functions: [[6, "f", 1]] }), ROOT);
    assert.deepEqual(coverageGaps(mergeCoverage([first, second]), ["src/a.js"]), []);
    assert.deepEqual(coverageGaps(mergeCoverage([first]), ["src/a.js"]), ["src/a.js:7: branch not taken", "src/a.js:9: line not run"]);
    // A file one machine never loaded is covered by the one that did.
    assert.deepEqual(coverageGaps(mergeCoverage([new Map(), second]), ["src/a.js"]), ["src/a.js:7: branch not taken"]);
});
