"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculatePageGeometry, calculatePlacement, canPassThrough } = require("../../../src/core/geometry.js");
const settings = { paperSize: "A4", orientation: "Portrait", resolutionLimit: 300 };

test("paper is point geometry without a page pixel canvas", () => {
    assert.deepEqual(calculatePageGeometry(settings), { widthPoints: 595.2756, heightPoints: 841.8898, resolutionLimit: 300 });
    assert.deepEqual(calculatePageGeometry({ paperSize: "Letter", orientation: "Landscape", resolutionLimit: 72 }), { widthPoints: 792, heightPoints: 612, resolutionLimit: 72 });
});

test("natural placement is independent of the downsampling ceiling and never enlarges", () => {
    const small = calculatePlacement(calculatePageGeometry(settings), { width: 400, height: 200 });
    assert.deepEqual([small.widthPoints, small.heightPoints, small.widthPixels, small.heightPixels], [400, 200, 400, 200]);
    assert.equal(small.relativeScale, 400 / 595.2756);
    const large = calculatePlacement(calculatePageGeometry({ ...settings, resolutionLimit: 72 }), { width: 2000, height: 1000 });
    assert.deepEqual([large.widthPixels, large.heightPixels, large.relativeScale], [595, 297, 1]);
    const thin = calculatePlacement(calculatePageGeometry(settings), { width: 1, height: 20000 });
    assert.deepEqual([thin.widthPixels, thin.heightPixels], [1, 3507]);
});

test("pass-through requires every metadata and density condition", () => {
    const source = { loader: "jpegload", width: 400, height: 200, bands: 3, icc: false, orientation: 1, interpretation: "srgb" };
    const placement = { widthPixels: 400, heightPixels: 200 };
    assert.equal(canPassThrough(source, placement), true);
    assert.equal(canPassThrough({ ...source, interpretation: "" }, placement), true);
    for (const patch of [{ loader: "pngload" }, { bands: 1 }, { icc: true }, { orientation: 6 }, { interpretation: "cmyk" }, { width: 401 }, { height: 201 }]) {
        assert.equal(canPassThrough({ ...source, ...patch }, placement), false);
    }
});
