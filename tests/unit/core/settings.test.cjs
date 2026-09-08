"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    backgroundDefinition,
    normalizeSettings
} = require("../../../src/core/settings.js");

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

test("backgroundDefinition derives the vips vector from the colour", () => {
    // What the table of four held, now worked out -- so a colour the user
    // typed a moment ago needs no entry written for it.
    assert.equal(backgroundDefinition("#FFFFFF").vipsVector, "255");
    assert.equal(backgroundDefinition("#000000").vipsVector, "0");
    assert.equal(backgroundDefinition("#8E79E0").vipsVector, "142,121,224");
    assert.equal(backgroundDefinition("#204486").vipsVector, "32,68,134");
    assert.equal(backgroundDefinition("#C7DAE8").vipsVector, "199,218,232");
    assert.throws(() => backgroundDefinition("black"), /six hexadecimal digits/u);
});

test("a colour with two channels alike is still a colour", () => {
    // One number means grey, and vips spreads it over every band. A colour
    // that is grey in two of its three channels is not grey, and sending one
    // number for it would paint the page a different colour than was asked
    // for -- silently, since the page would still be a colour.
    assert.equal(backgroundDefinition("#C7C7E8").vipsVector, "199,199,232");
    assert.equal(backgroundDefinition("#C7E8E8").vipsVector, "199,232,232");
    assert.equal(backgroundDefinition("#E8C7E8").vipsVector, "232,199,232");
    assert.equal(backgroundDefinition("#7F7F7F").vipsVector, "127", "and a grey is one");
});

test("normalizeSettings ignores inherited properties", () => {
    // A settings object parsed from JSON has a prototype; a choice must not be
    // satisfiable by something like "constructor".
    assert.throws(
        () => normalizeSettings(settings({ paperSize: "constructor" })),
        /Unsupported paper size/u
    );
});

test("every offered background has a vips vector", () => {
    // A colour that reaches the dialog without one would fail mid-run, after
    // the user has answered everything.
    for (const hex of ["#FFFFFF", "#000000", "#8E79E0", "#204486", "#C7DAE8"]) {
        const definition = backgroundDefinition(hex);

        assert.ok(definition.vipsVector.length > 0, hex);
        assert.match(definition.vipsVector, /^\d+(?:,\d+,\d+)?$/u, hex);
    }
});

test("the vips vector matches the hex it is keyed by", () => {
    // A grey is a single value and a colour is a triple, which is what vips
    // expects; either way the numbers must be the hex.
    const expected = {
        "#FFFFFF": "255",
        "#000000": "0",
        "#8E79E0": "142,121,224",
        "#204486": "32,68,134"
    };

    for (const [hex, vector] of Object.entries(expected)) {
        assert.equal(backgroundDefinition(hex).vipsVector, vector, hex);

        const channels = vector.split(",").map(Number);
        const fromHex = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

        assert.deepEqual(
            channels.length === 1 ? [channels[0], channels[0], channels[0]] : channels,
            fromHex,
            `${hex} vector should be its own channels`
        );
    }
});
