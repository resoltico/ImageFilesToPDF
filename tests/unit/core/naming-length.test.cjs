"use strict";

/*
 * A filename has a size, and the output name is longer than the name it came
 * from. A valid source name could therefore produce an output name the
 * filesystem refuses -- and nothing truncates it on the way: the write fails
 * with a complaint about the length, which is a poor answer to "convert this
 * photograph".
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { outputNameForSeparate, nextUniquePath } = require("../../../src/core/naming.js");
const { utf8Length } = require("../../../src/core/numbers.js");

const BUDGET = 255;
const TIMESTAMP = "20260907_010203";

function nameFor(stem, timestamp = TIMESTAMP) {
    return outputNameForSeparate({ originalName: `${stem}.jpg` }, timestamp);
}

test("an ordinary name is left exactly as it was", () => {
    assert.equal(nameFor("holiday photo"), "holiday photo_20260907_010203.pdf");
});

test("a long source name produces an output name that fits", () => {
    // 244 characters is a valid filename. With the timestamp and extension it
    // became 264, which the filesystem refuses.
    const name = nameFor("x".repeat(244));

    assert.ok(utf8Length(name) <= BUDGET, `${utf8Length(name)} bytes`);
    assert.ok(name.endsWith("_20260907_010203.pdf"), name.slice(-24));
});

test("the budget is counted in bytes, and never cuts a character in half", () => {
    // Accented letters are two bytes each and emoji four. Cutting by string
    // length would leave one byte of a character behind, which is not text.
    for (const character of ["é", "日", "📁"]) {
        const name = nameFor(character.repeat(200));

        assert.ok(utf8Length(name) <= BUDGET, `${character}: ${utf8Length(name)} bytes`);
        assert.ok(
            name.startsWith(character.repeat(2)),
            `${character}: the name still reads as itself`
        );
        assert.equal(
            [...name].every((one) => one !== "�"),
            true,
            `${character}: nothing was cut in half`
        );
    }
});

test("there is room left for the collision suffix", () => {
    // A name that fits only until it needs _2 is a name that fits until the
    // second run of the day.
    const name = nameFor("x".repeat(300));
    const taken = new Set([`/a/${name}`]);
    const next = nextUniquePath(`/a/${name}`, (path) => taken.has(path));

    assert.ok(utf8Length(next.slice("/a/".length)) <= BUDGET, next.length);
    assert.ok(next.endsWith("_2.pdf"));
});

test("the room reserved follows the timestamp it is given", () => {
    // A headless caller supplies its own, and a constant reserve would
    // under-count for a longer one.
    const name = nameFor("x".repeat(300), "20260907_010203_run_of_the_afternoon");

    assert.ok(utf8Length(name) <= BUDGET, `${utf8Length(name)} bytes`);
});

test("a stem cut short does not end in a dot or an underscore", () => {
    // Sanitizing exists to keep a name from ending in one of those; cutting a
    // long name short can produce exactly that, at the join with the
    // timestamp, where it reads as a mistake.
    assert.doesNotMatch(
        nameFor(`${"a".repeat(229)}._x`),
        /[._]_20260907_010203\.pdf$/u
    );
    assert.match(nameFor("a".repeat(300)), /^a+_20260907_010203\.pdf$/u);
});

test("a newline in the parent folder does not stop the numbering", () => {
    // The extension is read off the end rather than matched across the whole
    // path: a pattern could not reach it past a newline, and a folder with
    // one in its name is a folder this action handles everywhere else.
    const taken = new Set(["/Scans\n2026/photo.pdf"]);

    assert.equal(
        nextUniquePath("/Scans\n2026/photo.pdf", (path) => taken.has(path)),
        "/Scans\n2026/photo_2.pdf"
    );
});

test("a name that is not a PDF is refused rather than numbered", () => {
    assert.throws(
        () => nextUniquePath("/a/notes.txt", () => true),
        /Cannot generate a unique PDF path/u
    );
});

test("the extension is matched whatever its case", () => {
    const taken = new Set(["/a/b.PDF"]);

    assert.equal(nextUniquePath("/a/b.PDF", (path) => taken.has(path)), "/a/b_2.PDF");
});
