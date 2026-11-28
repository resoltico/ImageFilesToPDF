"use strict";

/*
 * A platform helper is a long-lived child answering one JSON line per request.
 * These helpers are small Node programs; the session around them is real.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { setImmediate, setTimeout } = require("node:timers");
const { helperSession } = require("../../../src/engine/line-helper.js");

const helper = (script) => helperSession(process.execPath, ["-e", script], { detached: false });
const ECHO = "require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => process.stdout.write(line + '\\n'));";

test("requests are answered in turn, and the session closes cleanly", async () => {
    const session = helper(ECHO);
    const [first, second] = await Promise.all([session.request({ index: 1 }), session.request({ index: 2 })]);
    assert.deepEqual([first, second], [{ index: 1 }, { index: 2 }]);
    await session.close();
});

test("a helper that ends without answering is reported by what it said, or by its silence", async () => {
    const spoke = helper("process.stderr.write('helper broke'); process.exit(1);");
    await assert.rejects(spoke.request({}), /^Error: helper broke$/u);
    await spoke.close();
    const silent = helper("process.exit(0);");
    await assert.rejects(silent.request({}), /ended before answering/u);
    await silent.close();
});

test("a helper that stops reading fails the request without breaking the engine", async () => {
    const session = helper("process.stdin.destroy(); setTimeout(() => {}, 300);");
    await new Promise((resolve) => { setTimeout(resolve, 100); });
    await assert.rejects(session.request({ large: "x".repeat(1048576) }), /ended before answering/u);
    await session.close();
});

test("a reply that is not JSON fails the request, ends the helper, and later requests fail too", async () => {
    const session = helper("process.stdin.once('data', () => process.stdout.write('not json\\n')); setInterval(() => {}, 1000);");
    await assert.rejects(session.request({}), /not valid JSON/u);
    await assert.rejects(session.request({}), /ended before answering/u);
    await session.close();
});

test("a helper that writes more than the limit to standard error is stopped", async () => {
    const session = helper("const b = 'e'.repeat(1 << 20); for (let i = 0; i < 9; i += 1) { process.stderr.write(b); } setInterval(() => {}, 1000);");
    await assert.rejects(session.request({}));
    await session.close();
});

test("a helper that cannot start fails its request", async () => {
    const session = helperSession(path.join(path.dirname(process.execPath), "no-such-helper"), [], { detached: false });
    await assert.rejects(session.request({}));
    await assert.rejects(session.close());
});

test("a request past its deadline stops the helper", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    // The module reads the clock when it loads, so it is loaded again under the stand-in.
    const file = require.resolve("../../../src/engine/line-helper.js");
    delete require.cache[file];
    const fresh = require("../../../src/engine/line-helper.js");
    const session = fresh.helperSession(process.execPath, ["-e", "setInterval(() => {}, 1000);"], { detached: false });
    const pending = session.request({});
    await new Promise((resolve) => { setImmediate(resolve); });
    context.mock.timers.tick(900000);
    await assert.rejects(pending);
    await session.close();
});
