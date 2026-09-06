"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    errorMessage,
    isUserCancelled,
    summarizeCommand,
    describeForLog
} = require("../../../src/core/errors.js");

test("errorMessage extracts a message from anything", () => {
    assert.equal(errorMessage(null), "Unknown error");
    assert.equal(errorMessage(undefined), "Unknown error");
    assert.equal(errorMessage(new Error("boom")), "boom");
    assert.equal(errorMessage("plain"), "plain");
    assert.equal(errorMessage({ message: "object" }), "object");
});

test("isUserCancelled recognizes both spellings and the error number", () => {
    assert.equal(isUserCancelled(new Error("User cancelled.")), true);
    assert.equal(isUserCancelled(new Error("User canceled.")), true);
    assert.equal(isUserCancelled({ errorNumber: -128 }), true);
});

test("isUserCancelled returns false, not a falsy operand", () => {
    // A leaked `null` here would still be falsy, but callers compare against
    // false and the value is reported in diagnostics.
    assert.equal(isUserCancelled(null), false);
    assert.equal(isUserCancelled(new Error("disk full")), false);
    assert.equal(isUserCancelled({ errorNumber: -1 }), false);
});

test("summarizeCommand elides only oversized commands", () => {
    assert.equal(summarizeCommand("short"), "short");

    const long = "x".repeat(5000);
    const summary = summarizeCommand(long);

    assert.ok(summary.length < long.length);
    assert.match(summary, /command truncated/u);
    assert.ok(summary.startsWith("x".repeat(100)));
});

test("describeForLog keeps the failing command; the message does not", () => {
    // The split exists so a dialog can show the cause without an argv dump,
    // while a log still has the command that failed.
    const withCommand = new Error("Command failed while resizing photo.png.");

    withCommand.command = "'/bin/vips' 'thumbnail' '/a/photo.png'";

    assert.ok(!withCommand.message.includes("/bin/vips"));
    assert.match(describeForLog(withCommand), /Command failed while resizing/u);
    assert.match(describeForLog(withCommand), /'\/bin\/vips' 'thumbnail'/u);
});

test("describeForLog degrades to the message when there is no command", () => {
    assert.equal(describeForLog(new Error("plain failure")), "plain failure");
    assert.equal(describeForLog(null), "Unknown error");
});

test("summarizeCommand keeps a command of exactly the maximum length", () => {
    // The bound is inclusive; `<` instead of `<=` would elide a command that
    // fits, and the elision itself is lossy.
    const exact = "x".repeat(4000);

    assert.equal(summarizeCommand(exact), exact);
    assert.match(summarizeCommand(`${exact}y`), /command truncated/u);
});

test("summarizeCommand keeps the end of an oversized command", () => {
    // The tail is where the arguments that failed usually are, so a sign
    // error in the slice would drop the most useful part.
    const long = `${"a".repeat(5000)}DISTINCTIVE-TAIL`;
    const summary = summarizeCommand(long);

    assert.ok(summary.endsWith("DISTINCTIVE-TAIL"), "the tail must survive");
    assert.ok(summary.startsWith("aaa"), "and so must the head");
});

test("an elided command says that it was elided", () => {
    // Without the marker the head and the tail read as one command, and the
    // reader has no way to tell that the middle is missing.
    const long = `a${"b".repeat(5000)}c`;
    const summary = summarizeCommand(long);

    assert.ok(summary.includes("...[command truncated]..."), summary.slice(0, 80));
    assert.ok(summary.startsWith("a"), "the head is kept");
    assert.ok(summary.endsWith("c"), "and so is the tail");
});

test("the elision is set off from the command, not run into it", () => {
    // Joined without the blank lines, the marker reads as part of the
    // command it is interrupting.
    const summary = summarizeCommand(`a${"b".repeat(5000)}c`);
    const parts = summary.split("\n\n");

    assert.equal(parts.length, 3);
    assert.equal(parts[1], "...[command truncated]...");
});

test("the failing command survives being wrapped in context", () => {
    // Only the innermost error carries the command, and every layer that adds
    // context wraps it as a cause. Reading the outermost error alone finds
    // nothing, and the one detail worth having in a log is the one that goes
    // missing.
    const inner = Object.assign(new Error("VipsForeignLoad: broken"), {
        command: "'/v/vips' 'thumbnail' '/a/x.jpg'"
    });
    const wrapped = new Error(`photo.jpg: ${inner.message}`, { cause: inner });
    const twice = new Error(`converting: ${wrapped.message}`, { cause: wrapped });

    for (const error of [inner, wrapped, twice]) {
        assert.match(describeForLog(error), /Command:\n'\/v\/vips' 'thumbnail'/u);
    }
});

test("an error carrying no command anywhere reports only its message", () => {
    const plain = new Error("something went wrong");

    assert.equal(describeForLog(plain), "something went wrong");
    assert.equal(describeForLog(new Error("outer", { cause: plain })), "outer");
});
