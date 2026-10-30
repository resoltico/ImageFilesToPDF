"use strict";
const { rgbOf } = require("../core/colour.js");
const FAIL_ON_DAMAGE = "--fail-on=error";
const GREY_ALPHA_BANDS = 2;
const RGB_ALPHA_BANDS = 4;

function backgroundVector(background) {
    const { red, green, blue } = rgbOf(background);
    return [red, green, blue].join(",");
}

function hasAlphaBand(bandCount, interpretation = "") {
    const bands = Number(bandCount);
    return bands === GREY_ALPHA_BANDS || (interpretation === "cmyk" ? bands > RGB_ALPHA_BANDS : bands >= RGB_ALPHA_BANDS);
}

function buildThumbnailArgv(vipsPath, inputPath, outputPath, options) {
    const { placement, source, background, quality, intermediate } = options;
    const saver = intermediate ? outputPath : `${outputPath}[keep=none${outputPath.endsWith(".jpg") ? `,Q=${quality},background=${backgroundVector(background).replace(/,/gu, " ")}` : ""}]`;
    const argv = [vipsPath, "thumbnail", inputPath, saver, String(placement.widthPixels), `--height=${placement.heightPixels}`, "--size=down", FAIL_ON_DAMAGE];
    if (source.bands !== 1 || source.icc) { argv.push("--export-profile=srgb"); }
    return argv;
}

function buildFlattenArgv(vipsPath, inputPath, outputPath, background) {
    return [vipsPath, "flatten", inputPath, `${outputPath}[keep=none]`, `--background=${backgroundVector(background)}`];
}
function buildDecodeArgv(vipsPath, inputPath) { return [vipsPath, "avg", `${inputPath}[fail-on=error]`]; }
module.exports = { backgroundVector, FAIL_ON_DAMAGE, buildThumbnailArgv, buildFlattenArgv, buildDecodeArgv, hasAlphaBand };
