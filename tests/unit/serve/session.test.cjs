"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const { Buffer } = require("node:buffer");
const { createInterface } = require("node:readline");
const { setImmediate } = require("node:timers/promises");
const { serve } = require("../../../src/serve/serve.js");
const { runOutcome, failedRun } = require("../../../src/core/outcomes.js");
const { DEFAULT_SETTINGS } = require("../../../src/core/settings.js");
const { VERSION } = require("../../../src/core/version.js");

const refused = { path: "/fixture/vector.svg", name: "vector.svg", code: "unsupported-format", stage: "selection", reason: "Unsupported." };
const start = { type: "start", inputItems: ["/fixture/photo.png"] };
const settings = { type: "settings", values: DEFAULT_SETTINGS };
const context = { count: 1, selectedFolders: 0, folders: ["/fixture/"], rejected: [] };
const saved = { state: "saved", sources: start.inputItems, pages: 1, output: "/fixture/photo.pdf", issues: [] };

function connect(convertRun) {
    const errors = new PassThrough(), input = new PassThrough(), output = new PassThrough();
    const lines = createInterface({ input: output })[Symbol.asyncIterator]();
    let diagnostic = "";
    errors.setEncoding("utf8");
    errors.on("data", (part) => { diagnostic += part; });
    const done = serve({ input, output, errors, convertRun }).finally(() => { output.end(); errors.end(); });
    return {
        send(event) { input.write(`${JSON.stringify(event)}\n`); },
        sendBytes: (value) => input.write(value),
        eof() { input.end(); },
        async next(type) {
            const { value, done: ended } = await lines.next();
            assert.equal(ended, false, diagnostic || `Session ended before ${type}.`);
            const event = JSON.parse(value);
            assert.equal(event.type, type);
            return event;
        },
        async close(expected = 0) {
            assert.equal(await done, expected, diagnostic);
            output.end();
            input.end();
            return diagnostic;
        }
    };
}

function conversion(selection, process) {
    return async (invocation, commands, { session }) => {
        assert.deepEqual(invocation.inputItems, start.inputItems);
        try {
            const chosen = await session.settings(selection);
            assert.deepEqual(chosen, DEFAULT_SETTINGS);
            await process?.(commands, session.sink);
            return runOutcome([saved], selection.rejected);
        } catch (error) { return failedRun(error); }
    };
}

test("one session reviews, repeats invalid settings and publishes its ordered outcome", { timeout: 3000 }, async () => {
    const pipe = connect(conversion({ ...context, rejected: [refused] }, (commands, progress) => {
        commands.checkpoint();
        progress.start(1);
        progress.report(1, "Saved", "");
    }));
    assert.equal((await pipe.next("hello")).version, VERSION);
    pipe.send(start);
    assert.deepEqual((await pipe.next("review")).context.rejected, [refused]);
    pipe.send({ type: "continue" });
    await pipe.next("settings-needed");
    pipe.send({ type: "settings", values: {} });
    assert.equal((await pipe.next("settings-invalid")).issues.length, 6);
    pipe.send(settings);
    assert.equal((await pipe.next("phase")).phase, "Saved");
    assert.deepEqual(await pipe.next("progress"), { type: "progress", done: 1, total: 1 });
    assert.deepEqual((await pipe.next("outcome")).receipt, runOutcome([saved], [refused]));
    await pipe.close();
});

test("Stop and EOF during consent or settings reject the pending answer and finish canceled", { timeout: 3000 }, async () => {
    for (const scenario of ["review", "cancel-review", "settings", "invalid-settings", "EOF"]) {
        const review = scenario.includes("review");
        const pipe = connect(conversion({ ...context, rejected: review ? [refused] : [] }));
        // eslint-disable-next-line no-await-in-loop -- Sessions use separate streams and no shared state.
        await pipe.next("hello");
        pipe.send(start);
        // eslint-disable-next-line no-await-in-loop -- Stop is sent while this specific answer is pending.
        await pipe.next(review ? "review" : "settings-needed");
        if (scenario === "invalid-settings") {
            pipe.send({ type: "settings", values: {} });
            // eslint-disable-next-line no-await-in-loop -- Let the engine request the corrected settings first.
            await pipe.next("settings-invalid");
        }
        if (scenario === "EOF") { pipe.eof(); }
        else { pipe.send({ type: scenario === "cancel-review" ? "cancel" : "stop" }); }
        // eslint-disable-next-line no-await-in-loop -- Verify the full canceled receipt before opening another session.
        assert.equal((await pipe.next("outcome")).receipt.state, "canceled");
        // eslint-disable-next-line no-await-in-loop -- Confirm input ended and the handler released the session.
        await pipe.close();
    }
});

test("Stop during active work is latched until the next safe checkpoint", { timeout: 3000 }, async () => {
    const native = Promise.withResolvers();
    const pipe = connect(conversion(context, async (commands, progress) => {
        progress.report(0, "Preparing", "photo.png");
        await native.promise;
        commands.checkpoint();
    }));
    await pipe.next("hello");
    pipe.send(start);
    await pipe.next("settings-needed");
    pipe.send(settings);
    await pipe.next("phase");
    await pipe.next("progress");
    pipe.send({ type: "stop" });
    await setImmediate();
    native.resolve();
    const { receipt } = await pipe.next("outcome");
    assert.equal(receipt.state, "canceled");
    assert.deepEqual(receipt.documents, []);
    await pipe.close();
});

test("invalid bytes and out-of-order messages fail visibly", { timeout: 3000 }, async () => {
    const bytes = connect(() => { throw new Error("Conversion must not start."); });
    await bytes.next("hello");
    bytes.sendBytes(Buffer.from([0xff, 0x0a]));
    assert.match(await bytes.close(1), /invalid UTF-8/u);
    const early = connect(() => { throw new Error("Conversion must not start."); });
    await early.next("hello");
    early.send(settings);
    assert.match(await early.close(1), /out of order/u);
    const extra = connect(conversion(context));
    await extra.next("hello");
    extra.send(start);
    await extra.next("settings-needed");
    extra.send({ type: "continue" });
    const { receipt } = await extra.next("outcome");
    assert.equal(receipt.state, "invalid-request");
    assert.ok(receipt.issues.some(({ diagnostic }) => /out of order/u.test(diagnostic?.message)));
    await extra.close();
});


test("EOF before Start and Stop immediately after Start finish without a document", { timeout: 3000 }, async () => {
    const unopened = connect(() => { throw new Error("Conversion must not start after EOF."); });
    await unopened.next("hello");
    unopened.eof();
    assert.equal((await unopened.next("outcome")).receipt.state, "canceled");
    await unopened.close();

    const early = connect(async (invocation, commands) => {
        assert.deepEqual(invocation.inputItems, start.inputItems);
        await setImmediate();
        try { commands.checkpoint(); }
        catch (error) { return failedRun(error); }
        throw new Error("The first safe checkpoint must observe Stop.");
    });
    await early.next("hello");
    early.send(start);
    early.send({ type: "stop" });
    assert.deepEqual((await early.next("outcome")).receipt.documents, []);
    await early.close();
});
