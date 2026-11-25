"use strict";

/*
 * vipsheader output read as generated text.
 *
 * The header comes from an external tool and carries file names, so the
 * reader must turn any text into either metadata or the declared damage
 * refusal, and must classify any failure text into one of its three codes.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fc = require("fast-check");
const { OperationError } = require("../../../src/core/errors.js");
const { readMetadata, readMetadataBatch, headerFailureCode } = require("../../../src/backend/metadata.js");

const FIELD_LINE = fc.tuple(fc.constantFrom("width", "height", "bands", "vips-loader", "n-pages", "orientation", "interpretation", "icc-profile-data", "other"),
    fc.string({ unit: "binary", maxLength: 12 })).map(([field, value]) => `${field}: ${value}`);
const HEADER = fc.tuple(fc.array(fc.oneof(FIELD_LINE, fc.string({ unit: "binary" })), { maxLength: 10 }), fc.constantFrom("\n", "\r\n"))
    .map(([lines, separator]) => lines.join(separator));

function declared(run) {
    try { return run(); }
    catch (error) {
        assert.ok(error instanceof OperationError, `undeclared exception: ${error.name}: ${error.message}`);
        assert.equal(error.issues[0].code, "damaged");
        return null;
    }
}

test("any header text becomes metadata or the declared damage refusal", () => {
    fc.assert(fc.property(HEADER, fc.string({ unit: "binary", maxLength: 16 }), (text, path) => {
        const read = declared(() => readMetadata(text, path));
        if (read) {
            for (const name of ["width", "height", "bands", "orientation", "pages"]) {
                assert.ok(Number.isSafeInteger(read.raw[name]) && read.raw[name] >= 0, name);
            }
        }
    }));
});

test("a batch of header blocks is read in order or refused as ambiguous", () => {
    const paths = fc.uniqueArray(fc.string({ unit: "grapheme-ascii", minLength: 1, maxLength: 8 }).filter((path) => !path.includes("\n")), { minLength: 1, maxLength: 3 });
    fc.assert(fc.property(paths, HEADER, (names, text) => {
        const read = declared(() => readMetadataBatch(text, names));
        if (read) { assert.equal(read.length, names.length); }
    }));
});

test("any failure text is classified into one of the three codes", () => {
    fc.assert(fc.property(fc.string({ unit: "binary" }), (text) => {
        assert.ok(["not-an-image", "damaged", "unexaminable"].includes(headerFailureCode(text)));
    }));
});
