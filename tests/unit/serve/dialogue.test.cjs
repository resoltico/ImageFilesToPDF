"use strict";
const { setImmediate } = require("node:timers");
const test = require("node:test");
const assert = require("node:assert/strict");
const { dialogue } = require("../../../src/serve/dialogue.js");
const { interactions } = require("../../../src/serve/interactions.js");
const { UserCanceled } = require("../../../src/core/errors.js");
const { DEFAULT_SETTINGS } = require("../../../src/core/settings.js");

test("the message dialogue admits exactly one matching answer and latches Stop", async () => {
    let stopped = false;
    const queue = dialogue({
        checkpoint() { if (stopped) { throw new UserCanceled(); } },
        requestStop() { stopped = true; }
    });
    assert.throws(() => queue.expect("phase"), /out of order/u);
    assert.throws(() => queue.receive({ type: "continue" }), /out of order/u);
    const review = queue.expect("review");
    assert.throws(() => queue.expect("settings-needed"), /out of order/u);
    assert.throws(() => queue.receive({ type: "settings" }), /out of order/u);
    const continuation = { type: "continue" };
    queue.receive(continuation);
    assert.equal(await review, continuation);
    const settings = queue.expect("settings-needed");
    queue.stop();
    await assert.rejects(settings, UserCanceled);
    queue.stop();
    assert.throws(() => queue.expect("settings-invalid"), UserCanceled);
});

test("the interaction observer sends both progress forms without adding control messages", () => {
    const events = [];
    const { sink } = interactions((event) => events.push(event), () => undefined);
    sink.start(3);
    sink.report(1, "Checking images", "photo.png");
    sink.pause();
    sink.report(3, "Saved", "");
    sink.close();
    assert.deepEqual(events, [
        { type: "phase", phase: "Checking images" }, { type: "progress", done: 1, total: 3, current: "photo.png" },
        { type: "phase", phase: "Saved" }, { type: "progress", done: 3, total: 3 }
    ]);
});

test("the interaction accepts consent and reuses original context across a settings correction", async () => {
    const refused = { path: "/notes.png" };
    const context = { count: 1, rejected: [refused] };
    const events = [];
    const answers = [{ type: "continue" }, { type: "settings", values: {} }, { type: "settings", values: DEFAULT_SETTINGS }];
    const session = interactions(() => undefined, (event) => { events.push(event); return answers.shift(); });
    assert.deepEqual(await session.settings(context), DEFAULT_SETTINGS);
    assert.deepEqual(events.map(({ type }) => type), ["review", "settings-needed", "settings-invalid"]);
    assert.equal(events[0].context, context);
    assert.equal(events[1].context, context);
    assert.equal(events[2].issues.length, 6);
});

test("cancel, invalid consent and a mismatched settings answer all stop the interaction", async () => {
    const review = { count: 1, rejected: [{}] };
    const cancel = interactions(() => undefined, () => ({ type: "cancel" }));
    await assert.rejects(() => cancel.settings(review), UserCanceled);
    const wrong = interactions(() => undefined, () => ({ type: "start" }));
    await assert.rejects(() => wrong.settings(review), /selection review answer/u);
    await assert.rejects(() => wrong.settings({ ...review, rejected: [] }), /settings are required/u);
});

test("a stop that rejects an unawaited question leaves no unhandled rejection", async () => {
    const unhandled = [];
    const listener = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    try {
        const exchange = dialogue({ checkpoint: () => undefined, requestStop: () => undefined });
        exchange.expect("review");
        exchange.stop();
        await new Promise((resolve) => { setImmediate(resolve); });
        await new Promise((resolve) => { setImmediate(resolve); });
    } finally { process.off("unhandledRejection", listener); }
    assert.deepEqual(unhandled, []);
});
