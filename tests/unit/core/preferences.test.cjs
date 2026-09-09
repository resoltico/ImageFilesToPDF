"use strict";

/*
 * What a run remembers of the last one.
 *
 * The record is settings, not answers, and what comes back out of it has been
 * on disk where anything could have edited it. So the whole of this file is
 * one question asked two ways: does a record made here come back as the same
 * settings, and does anything else come back as nothing at all.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    DOMAIN,
    KEY,
    encode,
    rememberedAnswers
} = require("../../../src/core/preferences.js");
const { readAnswers } = require("../../../src/core/answers.js");
const { normalizeSettings } = require("../../../src/core/settings.js");

const PAPERS = ["A4", "Letter"];
const ORIENTATIONS = ["Portrait", "Landscape"];
const MODES = ["single", "separate"];
const COLOURS = ["#FFFFFF", "#000000", "#8E79E0", "#204486", "#C7DAE8", "#7F7F7F"];
const NUMBERS = [[72, 1], [300, 92], [1041, 100], [600, 50]];

function combinations(choices) {
    return choices.reduce(
        (rows, values) => rows.flatMap(
            (row) => values.map((value) => [...row, value])
        ),
        [[]]
    );
}

function everySettings() {
    const rows = combinations([PAPERS, ORIENTATIONS, MODES, COLOURS, NUMBERS]);

    return rows.map(([paperSize, orientation, mode, background, numbers]) =>
        normalizeSettings({
            paperSize,
            orientation,
            mode,
            background,
            dpi: numbers[0],
            quality: numbers[1]
        }));
}

test("a remembered run comes back as the settings it was", () => {
    // The one invariant worth stating: what is written, read back and
    // answered is what was written. Every combination, because the way this
    // breaks is one setting quietly failing to survive the round while the
    // other five prove nothing.
    const all = everySettings();

    assert.equal(all.length, 192, "every combination of these values, not one of them");

    for (const settings of all) {
        const answers = rememberedAnswers(encode(settings));

        assert.ok(answers, `nothing came back for ${JSON.stringify(settings)}`);
        assert.deepEqual(
            normalizeSettings(readAnswers(answers).settings),
            settings,
            `did not survive the round: ${JSON.stringify(settings)}`
        );
    }
});

test("what comes back is answers the form could have been given", () => {
    const settings = normalizeSettings({
        paperSize: "Letter",
        orientation: "Landscape",
        mode: "separate",
        background: "#C7DAE8",
        dpi: 600,
        quality: 80
    });

    assert.deepEqual(rememberedAnswers(encode(settings)), {
        paperSize: "US Letter",
        orientation: "Landscape",
        mode: "A separate PDF for each image",
        background: "#C7DAE8",
        dpi: "600",
        quality: "80"
    });
});

test("anything that is not a record this version can read is no answer", () => {
    // It has been on disk, where anything can edit it. A run opens on the
    // compiled defaults rather than on whatever was found there.
    const settings = normalizeSettings({
        paperSize: "A4",
        orientation: "Portrait",
        mode: "single",
        background: "#FFFFFF",
        dpi: 300,
        quality: 92
    });

    for (const refused of [
        "",
        "not json at all",
        "false",
        "0",
        "[]",
        "{}",
        JSON.stringify({ settings }),
        JSON.stringify({ dpi: 99999 }),
        JSON.stringify({ ...settings, background: "puce" }),
        JSON.stringify({ ...settings, paperSize: "Legal" })
    ]) {
        assert.equal(rememberedAnswers(refused), undefined, refused);
    }
});

test("the version is in the name of the key, so an older run cannot reach it", () => {
    // A record this version cannot read is one it must not overwrite either,
    // and a number inside the record cannot stop that: by the time it is read
    // the run is already pointed at the key it is about to write. People keep
    // more than one copy of this action pasted about, at more than one
    // version, so this is the ordinary case rather than a remote one.
    assert.match(KEY, /\.v1$/u);
    assert.equal(DOMAIN, "com.resoltico.ImageFilesToPDF");
    assert.equal(KEY, "lastSettings.v1");
});
