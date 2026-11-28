"use strict";

/*
 * The coverage rule: every file in scope loaded, every line, branch and
 * function run. The unit gate judges Node's lcov; the native gate judges raw
 * V8 coverage from many processes, which these tests produce for real.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const load = () => import("../../../tools/coverage.mjs");
const ROOT = path.resolve("/checkout");
const at = (relative) => path.join(ROOT, ...relative.split("/"));

function lcov(file, { lines = [], branches = [], functions = [] }) {
    return [
        `SF:${at(file)}`,
        ...functions.map(([line, name]) => `FN:${line},${name}`),
        ...functions.map(([, name, hits]) => `FNDA:${hits},${name}`),
        ...branches.map(([line, block, hits]) => `BRDA:${line},${block},0,${hits}`),
        ...lines.map(([line, hits]) => `DA:${line},${hits}`),
        "end_of_record"
    ].join("\n");
}

test("a wholly covered lcov scope has no gaps", async () => {
    const { lcovGaps } = await load();
    const record = lcov("src/a.js", { lines: [[1, 1], [2, 3]], branches: [[2, 0, 1], [2, 1, 2]], functions: [[1, "a", 1]] });
    assert.deepEqual(lcovGaps(record, ROOT, ["src/a.js"]), []);
});

test("an unloaded file, and a line, branch and function short of coverage, are each named", async () => {
    const { lcovGaps } = await load();
    const record = lcov("src/a.js", {
        lines: [[1, 1], [5, 0]], branches: [[3, 0, 1], [3, 1, 0], [4, 2, "-"]], functions: [[2, "helper, with comma", 0]]
    });
    assert.deepEqual(lcovGaps(`${record}\r\n`, ROOT, ["src/b.js", "src/a.js"]), [
        "src/a.js:2: function helper, with comma never called",
        "src/a.js:3: branch not taken",
        "src/a.js:4: branch not taken",
        "src/a.js:5: line not run",
        "src/b.js: never loaded by a test"
    ]);
    assert.deepEqual(lcovGaps(lcov("tests/helper.cjs", { lines: [[1, 0]] }), ROOT, []), [], "files outside the scope do not count");
});

// A module, run by real Node processes with the given arguments; each leaves raw V8 coverage.
const SOURCE = [
    "\"use strict\";",
    "function pick(flag) {",
    "    if (flag === \"a\" || flag === \"b\") { return 1; }",
    "    return 2;",
    "}",
    "",
    "function never() { return 0; }",
    "pick(process.argv[2]);",
    "module.exports = { never };",
    ""
].join("\n");

function recorded(runs) {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), "iftp-coverage-test-"));
    const folder = path.join(outer, "checkout");
    const coverage = path.join(outer, "v8");
    fs.mkdirSync(path.join(folder, "src"), { recursive: true });
    fs.writeFileSync(path.join(folder, "src", "pick.js"), SOURCE);
    fs.writeFileSync(path.join(outer, "outside.js"), "\"use strict\";\n");
    for (const flag of runs) {
        const result = spawnSync(process.execPath, [path.join(folder, "src", "pick.js"), flag], { env: { ...process.env, NODE_V8_COVERAGE: coverage } });
        assert.equal(result.status, 0);
    }
    spawnSync(process.execPath, [path.join(outer, "outside.js")], { env: { ...process.env, NODE_V8_COVERAGE: coverage } });
    return { outer, folder, coverage };
}

async function gapsAfter(...groups) {
    const { readV8Coverage, nativeGaps, serializeCoverage, deserializeCoverage } = await load();
    const machines = groups.map((runs) => {
        const { outer, folder, coverage } = recorded(runs);
        const record = deserializeCoverage(serializeCoverage(readV8Coverage(coverage, folder)));
        fs.rmSync(outer, { recursive: true });
        return record;
    });
    return { machines, gaps: nativeGaps(machines, ["src/pick.js"], () => SOURCE) };
}

test("raw V8 coverage names the branch, line and function that never ran", async () => {
    const { machines, gaps } = await gapsAfter(["a"]);
    assert.deepEqual([...machines[0].keys()], ["src/pick.js"], "only files inside the checkout are read");
    assert.deepEqual(gaps, [
        // The right side of ||, and what follows the if, which V8 begins where the if ends.
        "src/pick.js:3: branch not taken",
        "src/pick.js:3: branch not taken",
        "src/pick.js:4: line not run",
        "src/pick.js:7: line not run",
        "src/pick.js:7: function never never called"
    ]);
});

test("what ran on any machine ran, though a process that took a branch need not report it", async () => {
    // "a" leaves the right side of || at zero; "b" runs it at its parent's count, which V8 does not report.
    const { gaps } = await gapsAfter(["a"], ["b", "c"]);
    assert.deepEqual(gaps, ["src/pick.js:7: line not run", "src/pick.js:7: function never never called"]);
});

test("a file in scope that no process loaded is named", async () => {
    const { nativeGaps } = await load();
    assert.deepEqual(nativeGaps([new Map()], ["src/pick.js"], () => SOURCE), ["src/pick.js: never loaded by a test"]);
});
