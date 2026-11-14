"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { nativeEntryNames } = require("../../../src/host/directory-entry-names.js");
const { OperationError, UserCanceled } = require("../../../src/core/errors.js");
const { fakeDirectory } = require("../ports/fake-directory.cjs");

function fixture(names = [".", "..", "café-jpg 2.pdf"]) {
    const sample = fakeDirectory(names);
    const bindings = [];
    sample.objc = { import: () => undefined, unwrap: (value) => value.boxed,
        bindFunction: (name) => bindings.push(name) };
    sample.bindings = bindings;
    sample.read = () => nativeEntryNames(sample.objc, sample.ns, sample.ref)("/chosen/");
    return sample;
}
test("raw UTF-8 entry bytes survive decoding and a successful stream always closes", () => {
    const sample = fixture();
    assert.deepEqual(sample.read(), ["café-jpg 2.pdf"]);
    assert.deepEqual(sample.events, [["open", "/chosen/"], "read", "read", "read", "read", "close"]);
    assert.ok(sample.bindings.includes("opendir$INODE64"));assert.ok(sample.bindings.includes("readdir$INODE64"));
});
test("unsuffixed binding is selected only when both explicit inode64 symbols are absent", () => {
    const sample = fixture([]);
    sample.objc.bindFunction = (name) => { sample.bindings.push(name); if (name.endsWith("$INODE64")) { throw new Error("function not found"); } };
    assert.deepEqual(sample.read(), []);
    assert.ok(sample.bindings.includes("opendir"));assert.ok(sample.bindings.includes("readdir"));
    for (const missing of ["opendir", "readdir"]) {
        const inconsistent = fixture();
        inconsistent.objc.bindFunction = (name) => { if (name === `${missing}$INODE64`) { throw new Error("function not found"); } };
        assert.throws(inconsistent.read, OperationError);assert.deepEqual(inconsistent.events, []);
    }
});
test("unexpected binding faults remain faults without trying a weaker ABI", () => {
    for (const failure of [new TypeError("bridge"), new ReferenceError("symbol")]) {
        const sample = fixture();sample.objc.bindFunction = () => { throw failure; };
        assert.throws(sample.read, (error) => error === failure);assert.deepEqual(sample.events, []);
    }
    const unavailable = fixture(), unexpected = new Error("library unavailable");unavailable.objc.bindFunction = () => { throw unexpected; };
    assert.throws(unavailable.read, (error) => error === unexpected);
});
test("open, read and close refusals fail closed and preserve stream ownership", () => {
    const open = fixture();open.control.openCode = 13;
    assert.throws(open.read, OperationError);assert.deepEqual(open.events, [["open", "/chosen/"]]);
    const read = fixture([]);read.control.readCode = 5;
    assert.throws(read.read, OperationError);assert.deepEqual(read.events, [["open", "/chosen/"], "read", "close"]);
    const close = fixture([]);close.control.closeCode = 9;
    assert.throws(close.read, (error) => error.cause instanceof OperationError && error.issues[0].code === "cleanup" && error.issues[0].stage === "cleanup");assert.equal(close.events.at(-1), "close");
    const failed = fixture(), primary = new TypeError("record access failed");failed.control.readFault = primary;
    assert.throws(failed.read, (error) => error === primary);assert.equal(failed.events.at(-1), "close");
    failed.control.closeCode = 9;
    assert.throws(failed.read, (error) => error.cause === primary && error.issues[0].code === "fault" && error.issues.at(-1).code === "cleanup" && error.issues.at(-1).stage === "cleanup");
});
test("malformed directory records cannot become reported filenames", () => {
    const sample = fixture();
    const invalid = [];
    for (const [offset, value] of [[16, 21], [18, 0], [18, 1024]]) {
        const entry = sample.record("name");entry.writeUInt16LE(value, offset);invalid.push(entry);
    }
    const unterminated = sample.record("name");unterminated[25] = 1;invalid.push(unterminated);
    const embedded = sample.record("a b");embedded[22] = 0;invalid.push(embedded);
    const badUtf8 = sample.record("a");badUtf8[21] = 255;invalid.push(badUtf8);
    for (const entry of invalid) {
        const malformed = fixture([entry]);assert.throws(malformed.read, OperationError);assert.equal(malformed.events.at(-1), "close");
    }
    const altered = fixture();
    altered.ns.NSString.alloc.initWithDataEncoding = () => ({ isNil: () => false, dataUsingEncoding: () => ({ isEqualToData: () => false }) });
    assert.throws(altered.read, OperationError);assert.equal(altered.events.at(-1), "close");
});

test("a post-open errno bridge fault is protected by stream closure", () => {
    const primary = new TypeError("errno pointer unavailable"), sample = fixture();
    const errnoSymbol = "__error";
    sample.ns[errnoSymbol] = () => { throw primary; };
    assert.throws(sample.read, (error) => error === primary);
    assert.deepEqual(sample.events, [["open", "/chosen/"], "close"]);
});

test("a close bridge fault or cancellation retains its classification and mandatory cleanup", () => {
    for (const [cause, code] of [[new TypeError("Close bridge fault."), "fault"], [new UserCanceled(), "canceled"]]) {
        const sample = fixture([]);sample.ns.closedir = () => { throw cause; };
        assert.throws(sample.read, (error) => error.cause === cause && error.issues[0].code === code && error.issues.at(-1).code === "cleanup" && error.issues.at(-1).stage === "cleanup");
    }
});
