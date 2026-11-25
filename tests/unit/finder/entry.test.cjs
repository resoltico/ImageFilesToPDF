"use strict";

/*
 * The Shortcuts bridge: the Run JavaScript action calls run(input, parameters),
 * and the Quick Action is run on the input alone with the production ports.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

test("run hands the input to the Quick Action and returns what it returns", () => {
    const main = require.resolve("../../../src/finder/quick-action/main.js");
    const entry = require.resolve("../../../src/entry.js");
    const saved = require.cache[main];
    const calls = [];
    require.cache[main] = { id: main, filename: main, loaded: true, exports: { runQuickAction: (...args) => { calls.push(args); return "done"; } } };
    delete require.cache[entry];
    try {
        assert.equal(require("../../../src/entry.js").run(["/a.png"], { ignored: true }), "done");
        assert.deepEqual(calls, [[["/a.png"]]]);
    } finally {
        delete require.cache[entry];
        if (saved) { require.cache[main] = saved; } else { delete require.cache[main]; }
    }
});
