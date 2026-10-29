"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { calculatePageGeometry } = require("../../../src/core/geometry.js");
const {
    MAXIMUM_DPI
} = require("../../../src/core/limits.js");
const { fixed2 } = require("../../../src/core/numbers.js");

function settings(overrides) {
    return {
        paperSize: "A4",
        orientation: "Portrait",
        resolutionLimit: 300,
        quality: 92,
        mode: "combined",
        background: "#FFFFFF",
        ...overrides
    };
}

test("A4 is exactly 595.2756 x 841.8898 pt", () => {
    // A4 is 210 x 297 mm. Anything else is not A4, and readers report the
    // page as a custom size instead of labelling it.
    assert.deepEqual(calculatePageGeometry(settings()), {
        widthPixels: 2480,
        heightPixels: 3508,
        widthPoints: 595.2756,
        heightPoints: 841.8898,
        resolutionLimit: 300
    });
});

test("Letter landscape swaps the points and the pixels", () => {
    assert.deepEqual(
        calculatePageGeometry(
            settings({ paperSize: "Letter", orientation: "Landscape", resolutionLimit: 72 })
        ),
        {
            widthPixels: 792,
            heightPixels: 612,
            widthPoints: 792,
            heightPoints: 612,
            resolutionLimit: 72
        }
    );
});

test("the page size never drifts with ppi", () => {
    for (const resolutionLimit of [72, 150, 300, 600, MAXIMUM_DPI]) {
        const geometry = calculatePageGeometry(settings({ resolutionLimit }));

        assert.equal(geometry.widthPoints, 595.2756, `resolutionLimit ${resolutionLimit}`);
        assert.equal(geometry.heightPoints, 841.8898, `resolutionLimit ${resolutionLimit}`);
    }
});

test("the pixel canvas scales with ppi", () => {
    assert.equal(calculatePageGeometry(settings({ resolutionLimit: 72 })).widthPixels, 595);
    assert.equal(calculatePageGeometry(settings({ resolutionLimit: 1017 })).widthPixels, 8408);
});

test("what pdfcpu receives is the size readers call A4", () => {
    const a4 = calculatePageGeometry(settings());

    assert.equal(fixed2(a4.widthPoints), "595.28");
    assert.equal(fixed2(a4.heightPoints), "841.89");
});

test("settings are validated at entry before calculating geometry", () => {
    const { normalizeSettings } = require("../../../src/core/settings.js");
    assert.throws(() => calculatePageGeometry(normalizeSettings({ paperSize: "A4", orientation: "Portrait", mode: "combined", resolutionLimit: 0, quality: 92, background: "#FFFFFF" })), /Maximum resolution/u);
});
