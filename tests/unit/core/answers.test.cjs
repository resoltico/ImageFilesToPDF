"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readAnswers } = require("../../../src/core/answers.js");
const { defaultAnswers } = require("../../../src/core/form.js");
const { normalizeSettings } = require("../../../src/core/settings.js");

function answering(overrides) {
    return readAnswers({ ...defaultAnswers(), ...overrides });
}

test("the default answers produce settings the validator accepts", () => {
    const { settings, problems } = answering({});

    assert.equal(problems, undefined);
    assert.deepEqual(settings, {
        paperSize: "A4",
        orientation: "Portrait",
        mode: "single",
        background: "#FFFFFF",
        dpi: 300,
        quality: 92
    });
    assert.doesNotThrow(() => normalizeSettings(settings));
});

test("labels are translated to the values the pipeline stores", () => {
    const { settings } = answering({
        paperSize: "US Letter",
        mode: "A separate PDF for each image"
    });

    assert.equal(settings.paperSize, "Letter");
    assert.equal(settings.mode, "separate");
});

test("a colour arrives as a colour, chosen or typed", () => {
    // There is nothing to translate here any more. The list the form offers
    // holds the presets as the colours they are, so picking one puts a colour
    // in the field exactly as typing one does -- and a menu's wording is no
    // longer part of what the program accepts.
    assert.equal(answering({ background: "#204486" }).settings.background, "#204486");
    assert.equal(answering({ background: " c7dae8 " }).settings.background, "#C7DAE8");
    assert.deepEqual(
        answering({ background: "Dark blue (#204486)" }).problems,
        [{
            key: "background",
            message: "Page background must be six hexadecimal digits, for " +
                "example #C7DAE8. The # is optional, and transparency is " +
                "not supported."
        }],
        "and the wording of a menu is not a colour"
    );
});

test("numbers are accepted at both ends of their range", () => {
    assert.equal(answering({ dpi: "72" }).settings.dpi, 72);
    assert.equal(answering({ dpi: "1041" }).settings.dpi, 1041);
    assert.equal(answering({ quality: "1" }).settings.quality, 1);
    assert.equal(answering({ quality: "100" }).settings.quality, 100);
});

test("a number outside its range is refused, naming the range", () => {
    assert.deepEqual(answering({ dpi: "71" }).problems, [{
        key: "dpi",
        message: "Resolution: enter a whole number from 72 to 1041."
    }]);
    assert.equal(answering({ dpi: "1042" }).problems.length, 1);
    assert.equal(answering({ quality: "0" }).problems.length, 1);
    assert.equal(answering({ quality: "101" }).problems.length, 1);
});

test("anything that is not a whole number is refused", () => {
    for (const bad of ["", " ", "abc", "300abc", "abc300", "1e3", "300.5", "-5", "0x10"]) {
        assert.equal(
            answering({ dpi: bad }).problems?.length,
            1,
            `${JSON.stringify(bad)} must be refused`
        );
    }
});

test("surrounding whitespace is tolerated", () => {
    assert.equal(answering({ dpi: "  600  " }).settings.dpi, 600);
});

test("a label that is not on offer is refused", () => {
    const { problems } = answering({ paperSize: "Legal" });

    // Keyed, so the form can mark the row and not only describe it.
    assert.deepEqual(problems, [{
        key: "paperSize",
        message: 'Paper size: "Legal" is not one of the choices.'
    }]);
});

test("every problem is reported at once, not one per attempt", () => {
    // A form that surfaces the first bad field and then the second is the
    // stepwise dialogs again with extra steps.
    const { settings, problems } = answering({
        paperSize: "Legal",
        background: "Beige",
        dpi: "nope",
        quality: "9999"
    });

    assert.equal(settings, undefined);
    assert.equal(problems.length, 4);
    assert.deepEqual(
        problems.map((problem) => problem.key).sort(),
        ["background", "dpi", "paperSize", "quality"]
    );
    assert.ok(problems.some((problem) => problem.message.includes("Legal")));
    assert.ok(problems.some(
        (problem) => problem.message.includes("six hexadecimal digits")
    ), "and the colour says what a colour is, having no list to be absent from");
    // Named the way the form labels them, not the way a dialog would ask.
    assert.ok(problems.some((problem) => problem.message.startsWith("Resolution:")));
    assert.ok(problems.some((problem) => problem.message.startsWith("JPEG quality:")));
});

test("every value the form can offer survives the round trip", () => {
    // Whatever the form lets a person pick must come back as settings the
    // validator accepts, or the dialog cannot be answered correctly.
    const { formSpec } = require("../../../src/core/form.js");

    for (const row of formSpec().rows.filter((candidate) => candidate.options)) {
        for (const option of row.options) {
            const { settings, problems } = answering({ [row.key]: option.label });

            assert.equal(problems, undefined, `${option.label} was refused`);
            assert.doesNotThrow(() => normalizeSettings(settings));
        }
    }
});
