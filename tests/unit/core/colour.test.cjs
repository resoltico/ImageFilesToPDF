"use strict";

/*
 * What counts as a page background.
 *
 * Permissive at the edge and strict in what is kept, and the same grammar
 * wherever a colour arrives: a form, a dialog, or a headless configuration.
 * There used to be two spellings of this -- the settings took #RRGGBB and
 * nothing else, while the swatch parser beside it required upper case -- so a
 * value one accepted was one the other quietly made nothing of.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    COLOUR_ERROR,
    normalizeColour,
    rgbOf
} = require("../../../src/core/colour.js");

test("a colour is kept in one spelling, whatever it arrived in", () => {
    for (const written of ["#C7DAE8", "#c7dae8", "c7DaE8", "  #C7DAE8  ", "c7dae8"]) {
        assert.equal(normalizeColour(written), "#C7DAE8", written);
    }
});

test("normalizing is idempotent, so it does not matter who ran first", () => {
    // The form normalizes an answer and the settings normalize again behind
    // it. Neither needs to know whether the other has been.
    const once = normalizeColour(" c7dae8 ");

    assert.equal(normalizeColour(once), once);
});

test("the four presets are unchanged by being parsed", () => {
    for (const hex of ["#FFFFFF", "#000000", "#8E79E0", "#204486"]) {
        assert.equal(normalizeColour(hex), hex);
    }
});

test("six digits, and only six", () => {
    // Three could be shorthand or an unfinished value, and eight carries
    // transparency, which a page background has nothing to be transparent
    // against.
    for (const refused of ["#FFF", "#11223344", "#20448", "#2044866"]) {
        assert.throws(() => normalizeColour(refused), /six hexadecimal digits/u, refused);
    }
});

test("a colour is a colour, not a phrase that mentions one", () => {
    for (const refused of ["red", "rgb(1,2,3)", "Purple #8E79E0", "use #C7DAE8 please"]) {
        assert.throws(() => normalizeColour(refused), /six hexadecimal digits/u, refused);
    }
});

test("only text is read as a colour", () => {
    // A headless configuration is JSON, where a bare number is a mistake to
    // report rather than a colour to infer.
    for (const refused of [0xC7DAE8, ["#C7DAE8"], { hex: "#C7DAE8" }, null, undefined, ""]) {
        assert.throws(() => normalizeColour(refused), /six hexadecimal digits/u);
    }
});

test("the digits become the numbers vips is given", () => {
    assert.deepEqual(rgbOf("#C7DAE8"), { red: 199, green: 218, blue: 232 });
    assert.deepEqual(rgbOf("#000000"), { red: 0, green: 0, blue: 0 });
    assert.deepEqual(rgbOf("#FFFFFF"), { red: 255, green: 255, blue: 255 });
    assert.deepEqual(rgbOf(" 8e79e0 "), { red: 142, green: 121, blue: 224 });
    assert.throws(() => rgbOf("nope"), /six hexadecimal digits/u);
});

test("the refusal says what a colour is, since there is no list to name", () => {
    // A closed choice can say "not one of the choices". This has to teach the
    // grammar instead, and it is the same sentence in every front end.
    assert.match(COLOUR_ERROR, /six hexadecimal digits/u);
    assert.match(COLOUR_ERROR, /#C7DAE8/u);
    assert.match(COLOUR_ERROR, /transparency is not supported/u);
});
