"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { backgroundVector, normalizeSettings } = require("../../../src/core/settings.js");

function settings(overrides) {
    return {
        paperSize: "A4",
        orientation: "Portrait",
        dpi: 300,
        quality: 92,
        mode: "Single PDF",
        background: "#FFFFFF",
        ...overrides
    };
}

test("normalizeSettings canonicalizes the dialog values", () => {
    assert.deepEqual(normalizeSettings(settings()), {
        paperSize: "A4",
        orientation: "Portrait",
        dpi: 300,
        quality: 92,
        mode: "single",
        background: "#FFFFFF"
    });
});

test("normalizeSettings accepts both spellings of each mode", () => {
    assert.equal(normalizeSettings(settings({ mode: "Separate PDFs" })).mode, "separate");
    assert.equal(normalizeSettings(settings({ mode: "separate" })).mode, "separate");
    assert.equal(normalizeSettings(settings({ mode: "single" })).mode, "single");
});

test("normalizeSettings rejects unsupported choices", () => {
    assert.throws(
        () => normalizeSettings(settings({ paperSize: "Legal" })),
        /Unsupported paper size: Legal/u
    );
    assert.throws(
        () => normalizeSettings(settings({ orientation: "Sideways" })),
        /Unsupported page orientation: Sideways/u
    );
    assert.throws(
        () => normalizeSettings(settings({ mode: "Many" })),
        /Unsupported output mode: Many/u
    );
    assert.throws(
        () => normalizeSettings(settings({ background: "black" })),
        /six hexadecimal digits/u
    );
});

test("normalizeSettings enforces the numeric ranges", () => {
    for (const dpi of [71, 1201, 72.5, "x"]) {
        assert.throws(() => normalizeSettings(settings({ dpi })), /DPI must be/u);
    }

    for (const quality of [0, 101, 1.5]) {
        assert.throws(() => normalizeSettings(settings({ quality })), /Quality must be/u);
    }
});

test("the vips vector is the three components of the colour", () => {
    // One number for a grey and three for a colour is what the table of four
    // held. The reason was a one-band image reaching the flatten, which the
    // resize stage rules out -- and vips broadcasts a single value across
    // every band in any case, so the two forms said the same thing.
    assert.equal(backgroundVector("#FFFFFF"), "255,255,255");
    assert.equal(backgroundVector("#000000"), "0,0,0");
    assert.equal(backgroundVector("#8E79E0"), "142,121,224");
    assert.equal(backgroundVector("#204486"), "32,68,134");
    assert.equal(backgroundVector("#C7DAE8"), "199,218,232");
    assert.throws(() => backgroundVector("black"), /six hexadecimal digits/u);
});

test("a grey is three components like anything else", () => {
    // Nothing distinguishes them any more, and nothing has to: a colour that
    // is grey in two of its three channels was the case a shorter form got
    // wrong, and there is no shorter form to get it wrong.
    assert.equal(backgroundVector("#7F7F7F"), "127,127,127");
    assert.equal(backgroundVector("#C7C7E8"), "199,199,232");
    assert.equal(backgroundVector("#C7E8E8"), "199,232,232");
});

test("every offered background has a vips vector", () => {
    // A colour that reaches the dialog without one would fail mid-run, after
    // the user has answered everything.
    for (const hex of ["#FFFFFF", "#000000", "#8E79E0", "#204486", "#C7DAE8"]) {
        assert.match(backgroundVector(hex), /^\d+,\d+,\d+$/u, hex);
    }
});

test("the vips vector is the hex it was made from", () => {
    // Whatever else it is, the numbers vips is given have to be the colour
    // that was asked for.
    for (const hex of ["#FFFFFF", "#000000", "#8E79E0", "#204486", "#C7DAE8"]) {
        assert.deepEqual(
            backgroundVector(hex).split(",").map(Number),
            [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)),
            `${hex} vector should be its own channels`
        );
    }
});
