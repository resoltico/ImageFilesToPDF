"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    calculatePlacement,
    calculatePageGeometry
} = require("../../../src/core/geometry.js");

/*
 * Where an image sits on the page.
 *
 * Physical placement and sampling density are separate decisions. Deciding
 * placement from the pixel canvas made the resolution setting move the
 * picture: the same photograph covered 102 mm at 300 DPI and 51 mm at 600.
 */

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

test("placement is the image's own size on paper, capped to the page", () => {
    // One source pixel is one point. An image smaller than the page keeps its
    // natural size; a larger one is scaled down to fit and never enlarged
    // beyond that.
    const a4 = calculatePageGeometry(settings({ dpi: 300 }));

    // 300x200 fits comfortably: it stays 300x200 points.
    const small = calculatePlacement(a4, { width: 300, height: 200 });

    assert.equal(Math.round(small.widthPoints), 300);
    assert.equal(Math.round(small.heightPoints), 200);

    // 1200x800 is wider than A4's 595 points: scaled down to the width.
    const wide = calculatePlacement(a4, { width: 1200, height: 800 });

    assert.equal(Math.round(wide.widthPoints), 595);
    assert.equal(Math.round(wide.heightPoints), 397);

    // 800x1200 is taller than A4's 842 points: scaled down to the height.
    const tall = calculatePlacement(a4, { width: 800, height: 1200 });

    assert.equal(Math.round(tall.heightPoints), 842);
    assert.ok(tall.widthPoints < 595);
});

test("placement never depends on the resolution", () => {
    // The defect this replaced: the same photograph covered 102 mm at 300 DPI
    // and 51 mm at 600, because the page was a larger number of pixels while
    // the image stayed the same number.
    const source = { width: 1200, height: 800 };
    const points = [72, 150, 300, 600, 1041].map((dpi) => {
        const placement = calculatePlacement(
            calculatePageGeometry(settings({ dpi })),
            source
        );

        return `${Math.round(placement.widthPoints)}x${Math.round(placement.heightPoints)}`;
    });

    assert.equal(new Set(points).size, 1, points.join(" "));
});

test("the pixel canvas for the placement does follow the resolution", () => {
    // Physical size is fixed; sampling density is what DPI selects.
    const source = { width: 300, height: 200 };
    const at72 = calculatePlacement(calculatePageGeometry(settings({ dpi: 72 })), source);
    const at144 = calculatePlacement(calculatePageGeometry(settings({ dpi: 144 })), source);

    assert.equal(at72.widthPixels, 300);
    assert.equal(at144.widthPixels, 600, "twice the resolution, twice the pixels");
    assert.equal(at72.widthPoints, at144.widthPoints);
});

test("a placement is never smaller than a pixel", () => {
    // A very small image at a very low resolution rounds towards nothing, and
    // vips cannot make an image of zero width.
    const placement = calculatePlacement(
        calculatePageGeometry(settings({ dpi: 72 })),
        { width: 1, height: 1 }
    );

    assert.ok(placement.widthPixels >= 1);
    assert.ok(placement.heightPixels >= 1);
});

test("orientation changes which edge constrains the placement", () => {
    const source = { width: 1200, height: 800 };
    const portrait = calculatePlacement(
        calculatePageGeometry(settings({ orientation: "Portrait", dpi: 300 })),
        source
    );
    const landscape = calculatePlacement(
        calculatePageGeometry(settings({ orientation: "Landscape", dpi: 300 })),
        source
    );

    assert.ok(
        landscape.widthPoints > portrait.widthPoints,
        "a wide image fits larger on a landscape page"
    );
});
