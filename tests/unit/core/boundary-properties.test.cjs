"use strict";

/*
 * Parsers at trust boundaries, run against generated input.
 *
 * Each of these reads bytes or text another process, the user or the system
 * produced. The property is the same for all of them: any input yields either
 * the declared result or a declared refusal in the catalog's words, never an
 * exception the parser did not mean to raise.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fc = require("fast-check");
const { encodeMessage, decodeMessage } = require("../../../src/core/protocol.js");
const { message } = require("../../../src/core/messages.js");
const { validateSettings, SETTINGS_FIELDS } = require("../../../src/core/settings.js");
const { searchDirectories } = require("../../../src/core/executable-search.js");
const { unknownFormatCode, PNG_SIGNATURE, SIGNATURE_BYTES } = require("../../../src/core/raster-signatures.js");
const { readTimestamp, makeTimestamp } = require("../../../src/core/timestamps.js");
const { normalizeColor } = require("../../../src/core/color.js");

const PROTOCOL_REFUSALS = new Set(["engineMessageNotJson", "engineMessageTypeInvalid", "engineMessageFieldsInvalid"].map((id) => message(id)));
const LINE = fc.oneof(fc.string({ unit: "binary" }), fc.json(), fc.jsonValue().map((value) => JSON.stringify({ type: "progress", ...Object(value) })));

test("a protocol line decodes or is refused in the catalog's words", () => {
    fc.assert(fc.property(fc.constantFrom("client", "engine"), LINE, (sender, line) => {
        try {
            const decoded = decodeMessage(sender, line);
            assert.equal(typeof decoded.type, "string");
        } catch (error) {
            assert.ok(PROTOCOL_REFUSALS.has(error.message), `undeclared refusal: ${error.message}`);
        }
    }));
});

test("a declared message survives encoding and decoding unchanged", () => {
    const progress = fc.record({ type: fc.constant("progress"), done: fc.nat(), total: fc.nat() }, { requiredKeys: ["type", "done", "total"], noNullPrototype: true })
        .chain((base) => fc.option(fc.string({ unit: "binary" }), { nil: undefined }).map((current) => (current === undefined ? base : { ...base, current })));
    fc.assert(fc.property(progress, (event) => {
        assert.deepEqual(decodeMessage("engine", encodeMessage("engine", event).trimEnd()), event);
    }));
});

test("any settings value is validated without an exception", () => {
    const candidate = fc.oneof(fc.anything(), fc.dictionary(fc.constantFrom(...SETTINGS_FIELDS, "extra"), fc.jsonValue()));
    fc.assert(fc.property(candidate, (input) => {
        const result = validateSettings(input);
        assert.ok(Array.isArray(result.issues));
        if (result.issues.length === 0) { assert.deepEqual(Object.keys(result.settings).sort(), [...SETTINGS_FIELDS].sort()); }
        for (const issue of result.issues) { assert.equal(typeof issue.message, "string"); }
    }));
});

test("system path files yield only unique absolute directories, in file order", () => {
    const content = fc.array(fc.oneof(fc.string({ unit: "binary" }), fc.constant("/usr/bin"), fc.constant("~/x"), fc.constant("")), { maxLength: 6 }).map((lines) => lines.join("\n"));
    const names = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 5 });
    fc.assert(fc.property(content, names, fc.array(content, { maxLength: 5 }), (defaults, fileNames, contents) => {
        const fragments = Object.fromEntries(fileNames.map((name, index) => [name, contents[index] ?? ""]));
        const reversed = Object.fromEntries(Object.entries(fragments).reverse());
        const found = searchDirectories({ systemPaths: { defaults, fragments }, conventional: ["/opt/x/bin"] });
        assert.deepEqual(searchDirectories({ systemPaths: { defaults, fragments: reversed }, conventional: ["/opt/x/bin"] }), found);
        assert.equal(new Set(found).size, found.length);
        assert.ok(found.every((entry) => entry.startsWith("/") && !entry.includes("\0") && entry === entry.trim()));
        assert.ok(found.includes("/opt/x/bin"));
    }));
});

test("a file's leading bytes classify it, and a required signature means damage", () => {
    const bytes = fc.uint8Array({ maxLength: SIGNATURE_BYTES }).map((value) => [...value]);
    fc.assert(fc.property(bytes, (prefix) => {
        assert.ok(["damaged", "not-an-image"].includes(unknownFormatCode(prefix)));
        assert.equal(unknownFormatCode([...PNG_SIGNATURE, ...prefix]), "damaged");
    }));
});

test("a timestamp is read back only when it names a real local time", () => {
    fc.assert(fc.property(fc.oneof(fc.string({ unit: "binary" }), fc.stringMatching(/^\d{8}_\d{6}$/u)), (value) => {
        try {
            assert.equal(readTimestamp(value), value);
        } catch (error) {
            assert.equal(error.message, message("timestampInvalid", { form: "YYYYMMDD_HHMMSS" }));
        }
    }));
    fc.assert(fc.property(fc.date({ min: new Date(1000, 0, 1), max: new Date(9999, 11, 31), noInvalidDate: true }), (date) => {
        const stamp = makeTimestamp(date);
        assert.equal(readTimestamp(stamp), stamp);
    }));
});

test("a colour is normalized to #RRGGBB or refused", () => {
    fc.assert(fc.property(fc.oneof(fc.string({ unit: "binary" }), fc.stringMatching(/^#?[\da-fA-F]{6}$/u)), (value) => {
        try {
            assert.match(normalizeColor(value), /^#[\dA-F]{6}$/u);
        } catch (error) {
            assert.match(error.message, /^must be six hexadecimal digits/u);
        }
    }));
});
