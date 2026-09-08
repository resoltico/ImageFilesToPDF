"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildForm } = require("../../../src/runtime/appkit-form.js");
const { FORM_WIDTH } = require("../../../src/runtime/appkit-geometry.js");
const { WIDGETS } = require("../../../src/runtime/appkit.js");
const { formSpec } = require("../../../src/core/form.js");
const { createFakeObjC } = require("./fake-objc.cjs");

function build(spec = formSpec()) {
    const bridge = createFakeObjC();

    return { bridge, spec, ...buildForm(bridge, spec, WIDGETS) };
}

function columnsOf(view) {
    const editable = view.subviews.filter((child) => child.kind === "popup"
        || child.kind === "combo"
        || (child.kind === "field" && child.editable !== false));
    const [first] = editable;

    return {
        editable,
        first,
        labels: view.subviews.filter((child) => child.editable === false
            && child.rect.left < first.rect.left),
        hints: view.subviews.filter((child) => child.editable === false
            && child.rect.left > first.rect.left)
    };
}

test("labels end before the controls begin", () => {
    const { spec, view } = build();
    const { labels, first } = columnsOf(view);

    assert.equal(labels.length, spec.rows.length);

    for (const label of labels) {
        assert.ok(
            label.rect.left + label.rect.width <= first.rect.left,
            `${label.stringValue} runs into its control`
        );
    }
});

test("a hint sits past the control it belongs to, whatever its width", () => {
    // Two rows are typed into now and they are not the same width, so a hint
    // placed a fixed distance along would sit on top of one of them.
    const { view, controls, spec } = build();
    const { hints } = columnsOf(view);

    assert.equal(hints.length, 3, "the colour and the two numbers");

    for (const row of spec.rows.filter((candidate) => candidate.hint)) {
        const control = controls[row.key];
        const hint = hints.find((candidate) => candidate.stringValue === row.hint);

        assert.ok(hint, `${row.key} has no hint on the form`);
        assert.ok(
            hint.rect.left >= control.rect.left + control.rect.width,
            `${row.key}: the hint overlaps the control it describes`
        );
        assert.ok(
            hint.rect.left + hint.rect.width <= FORM_WIDTH,
            `${row.key}: the hint runs off the form`
        );
    }
});

test("no control runs off the edge of the form", () => {
    const { view } = build();

    for (const control of columnsOf(view).editable) {
        assert.ok(control.rect.left + control.rect.width <= FORM_WIDTH);
    }
});

test("a row named in the problems is marked, and the others are not", () => {
    // Reading which field is wrong and seeing it should not be different jobs.
    const spec = formSpec(
        { ...require("../../../src/core/form.js").defaultAnswers(), dpi: "nope" },
        [{ key: "dpi", message: "Resolution: enter a whole number from 72 to 1041." }]
    );
    const bridge = createFakeObjC();
    const { controls } = buildForm(bridge, spec, WIDGETS);

    assert.equal(controls.dpi.drawsBackground, true);
    assert.equal(controls.dpi.backgroundColor.name, "systemRed");
    assert.ok(
        controls.dpi.backgroundColor.alpha < 0.5,
        "a tint, not a fill: the value must stay readable"
    );

    for (const key of ["quality", "paperSize", "background"]) {
        assert.notEqual(
            controls[key].drawsBackground,
            true,
            `${key} is not in the problem list and must not be marked`
        );
    }
});

test("the rule a value breaks is marked along with the value", () => {
    const spec = formSpec(
        { ...require("../../../src/core/form.js").defaultAnswers(), quality: "500" },
        [{ key: "quality", message: "JPEG quality: enter a whole number from 1 to 100." }]
    );
    const bridge = createFakeObjC();
    const { view } = buildForm(bridge, spec, WIDGETS);
    const hints = view.subviews.filter((child) => child.editable === false
        && String(child.stringValue).includes("–"));
    const qualityHint = hints.find((hint) => hint.stringValue.includes("90–95"));
    const dpiHint = hints.find((hint) => hint.stringValue.includes("DPI"));

    assert.equal(qualityHint.textColor.name, "systemRed");
    assert.equal(dpiHint.textColor.name, "secondaryLabel", "the valid rule stays quiet");
});

test("a choice row can be marked too, not only a typed one", () => {
    // Rare, but reachable: an answer that is not one of the options at all.
    const { defaultAnswers } = require("../../../src/core/form.js");
    const spec = formSpec(
        { ...defaultAnswers(), paperSize: "Legal" },
        [{ key: "paperSize", message: 'Paper size: "Legal" is not one of the choices.' }]
    );
    const { controls } = buildForm(createFakeObjC(), spec, WIDGETS);

    assert.equal(controls.paperSize.drawsBackground, true);
    assert.equal(controls.paperSize.backgroundColor.name, "systemRed");
});

test("a hint is centred against the field it describes", () => {
    // Off-centre by a few points reads as a misalignment rather than as a
    // caption, and the sign of the offset decides whether it sits above or
    // below the value it qualifies.
    const { view, controls } = buildForm(createFakeObjC(), formSpec(), WIDGETS);
    const hints = view.subviews.filter((child) => child.editable === false
        && String(child.stringValue).includes("DPI"));
    const [hint] = hints;
    const field = controls.dpi;

    const centreOf = (rect) => rect.bottom + (rect.height / 2);

    assert.equal(centreOf(hint.rect), centreOf(field.rect));
    assert.ok(hint.rect.height < field.rect.height, "the hint is the smaller of the two");
});
