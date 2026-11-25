"use strict";

/*
 * The platform helper's line format and Windows path syntax, run against
 * generated input. Helper replies come from another process and paths from
 * the user, so any input must yield the declared result or a declared refusal.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fc = require("fast-check");
const { message } = require("../../../src/core/messages.js");
const { encodeHelperRequest, readHelperReply, windowsReply } = require("../../../src/engine/platform/helper-codec.js");
const { ordinaryWindowsPath, windowsToolPath, windowsOutputName, isDriveAbsolute } = require("../../../src/engine/path-syntax.js");

test("a helper request survives encoding, and the ASCII form is ASCII", () => {
    fc.assert(fc.property(fc.jsonValue({ noUnicodeString: false }), fc.boolean(), (request, ascii) => {
        const line = encodeHelperRequest(request, ascii);
        if (ascii) { assert.match(line, /^[\x20-\x7e]*$/u); }
        assert.deepEqual(readHelperReply(line), JSON.parse(JSON.stringify(request)));
    }));
});

test("a helper reply line parses or is refused in the catalog's words", () => {
    const refusals = new Set([message("platformHelperReplyNotJson"), message("windowsHelperInvalidReply")]);
    fc.assert(fc.property(fc.oneof(fc.string({ unit: "binary" }), fc.json()), (line) => {
        try {
            const reply = windowsReply(readHelperReply(line));
            assert.equal(typeof reply.ok, "boolean");
        } catch (error) {
            assert.ok(refusals.has(error.message), `undeclared refusal: ${error.message}`);
        }
    }));
});

test("Windows path syntax answers every string without an exception", () => {
    fc.assert(fc.property(fc.string({ unit: "binary" }), (value) => {
        assert.equal(typeof ordinaryWindowsPath(value), "boolean");
        assert.equal(typeof isDriveAbsolute(value), "boolean");
        assert.ok(windowsToolPath(value).startsWith("\\\\?\\"));
        assert.ok(windowsOutputName(value).endsWith(value));
    }));
});
