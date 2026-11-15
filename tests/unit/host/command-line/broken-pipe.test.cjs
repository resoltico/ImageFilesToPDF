"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const { withoutSigpipe } = require("../../../../src/host/command-line/broken-pipe.js");
const { IssueError, OperationError } = require("../../../../src/core/errors.js");
const { nativeBridge, withBridge } = require("./signal-bridge.cjs");

function fixture(overrides = {}) {
    const allocations = new Set(), before = Buffer.from("00000000000000000403020102000000", "hex"), events = [];
    let current = Buffer.from(before);
    const actions = {
        allocate() { const pointer = Buffer.alloc(16); allocations.add(pointer); return pointer; },
        read(number, pointer) { assert.equal(number, 13); current.copy(pointer); events.push("read"); return 0; },
        ignore(number) { assert.equal(number, 13); current = Buffer.alloc(16); current.writeBigUInt64LE(1n); events.push("ignore"); return 0; },
        restore(number, pointer) { assert.equal(number, 13); current = Buffer.from(pointer); events.push("restore"); return 0; },
        free(pointer) { assert(allocations.delete(pointer)); events.push("free"); },
        ...overrides
    };
    return { actions, allocations, before, events, get current() { return current; } };
}
for (const value of [true, false, undefined]) {
    test(`write result is transparent and full disposition restored: ${value}`, () => {
        const setup = fixture();
        assert.equal(withoutSigpipe(() => { assert.equal(setup.current.readBigUInt64LE(), 1n); return value; }, setup.actions), value);
        assert.deepEqual(setup.current, setup.before); assert.equal(setup.allocations.size, 0);
        assert.deepEqual(setup.events, ["read", "ignore", "restore", "free"]);
    });
}
for (const primary of [new OperationError("EPIPE"), new TypeError("write bug"), undefined, 0]) {
    test(`original write throw is unchanged after successful cleanup: ${String(primary)}`, () => {
        const setup = fixture(); let caught = Symbol("not caught");
        try { withoutSigpipe(() => { throw primary; }, setup.actions); } catch (error) { caught = error; }
        assert.equal(caught, primary); assert.deepEqual(setup.current, setup.before); assert.equal(setup.allocations.size, 0);
    });
}
test("failed allocation never writes or touches disposition", () => {
    const setup = fixture({ allocate: () => null });
    assert.throws(() => withoutSigpipe(() => assert.fail("must not write"), setup.actions), OperationError);
    assert.deepEqual(setup.events, []);
});
test("failed snapshot read frees storage without a restore", () => {
    const setup = fixture({ read: () => -1 });
    assert.throws(() => withoutSigpipe(() => assert.fail("must not write"), setup.actions), OperationError);
    assert.deepEqual(setup.events, ["free"]); assert.equal(setup.allocations.size, 0);
});
for (const ignore of [() => -1, () => { throw new TypeError("ignore bridge fault"); }]) {
    test(`a refused/throwing ignore conservatively restores prior action: ${ignore.toString()}`, () => {
        const setup = fixture({ ignore }); assert.throws(() => withoutSigpipe(() => assert.fail("must not write"), setup.actions));
        assert.deepEqual(setup.current, setup.before); assert.equal(setup.allocations.size, 0);
        assert.deepEqual(setup.events, ["read", "restore", "free"]);
    });
}
test("cleanup-only failure is honest even after bytes were written, snapshot is freed", () => {
    const setup = fixture({ restore: () => -1 }); let wrote = false;
    assert.throws(() => withoutSigpipe(() => { wrote = true; return true; }, setup.actions), (error) => {
        assert(error instanceof IssueError); assert.equal(error.issues[0].stage, "cleanup"); return /signal cleanup failed/u.test(error.message);
    });
    assert.equal(wrote, true); assert.notDeepEqual(setup.current, setup.before); assert.equal(setup.allocations.size, 0);
});
for (const primary of [new OperationError("EPIPE"), new TypeError("write implementation fault")]) {
    test(`secondary restore error retains primary cause and classification: ${primary.constructor.name}`, () => {
        const setup = fixture({ restore: () => -1 });
        assert.throws(() => withoutSigpipe(() => { throw primary; }, setup.actions), (error) => {
            assert(error instanceof IssueError); assert.equal(error.cause, primary);
            assert.equal(error.issues[0].stage, "reporting");
            assert.equal(error.issues[0].code, primary instanceof TypeError ? "fault" : "operation");
            assert.equal(error.issues[1].stage, "cleanup"); return true;
        });
        assert.equal(setup.allocations.size, 0);
    });
}
test("throwing restore and free errors remain visible after a primary failure", () => {
    const primary = new TypeError("write implementation fault"), setup = fixture({ restore: () => { throw new Error("restore bridge refused"); }, free: () => { throw new TypeError("free bridge fault"); } });
    assert.throws(() => withoutSigpipe(() => { throw primary; }, setup.actions), (error) => {
        assert.equal(error.cause, primary); assert.equal(error.issues.length, 3); assert.equal(error.issues[0].code, "fault");
        assert(error.issues.slice(1).every(issue => issue.stage === "cleanup")); return true;
    });
});
test("free-only failure is surfaced after a successful restore", () => {
    const setup = fixture({ free: () => { throw new TypeError("free bridge fault"); } });
    assert.throws(() => withoutSigpipe(() => true, setup.actions), (error) => error.issues[0].code === "fault" && error.issues[0].stage === "cleanup");
    assert.deepEqual(setup.current, setup.before);
});
test("default native adapter applies SIGPIPE-only guard and leaves other signals intact", () => {
    const setup = nativeBridge();
    withBridge(setup, () => assert.equal(withoutSigpipe(() => true), true));
    assert.equal(setup.allocations.size, 0); assert.equal(setup.sources.length, 0); assert.equal(setup.closeCalls, 0);
    for (const [number, bytes] of setup.old) { assert.deepEqual(setup.actions.get(number), bytes); }
    assert(setup.log.filter(([kind]) => ["read", "ignore", "restore"].includes(kind)).every(([, number]) => number === 13));
});
test("missing native bridge refuses before write", () => {
    assert.throws(() => withoutSigpipe(() => assert.fail("must not write")), /Objective-C bridge/u);
});
