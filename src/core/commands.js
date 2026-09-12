"use strict";

const { parseInteger } = require("./numbers.js");
const { backgroundVector } = require("./settings.js");
const {
    MINIMUM_QUALITY,
    MAXIMUM_QUALITY
} = require("./limits.js");

/*
 * Construction of the exact argument vectors handed to vips and pdfcpu.
 *
 * These are pure so that every flag the tools receive is asserted in unit
 * tests rather than discovered at runtime.
 */

const GREY_ALPHA_BANDS = 2;
const RGB_ALPHA_BANDS = 4;

/*
 * Resize and colour-convert in one stage.
 *
 * --export-profile=srgb performs a real ICC transform when the source carries
 * an embedded profile, so Display P3 screenshots and Adobe RGB photographs
 * keep their appearance. A separate "colourspace srgb" stage ignores embedded
 * profiles and silently shifts those colours.
 *
 * --size=down never enlarges: a small image is centred at its native size
 * rather than upscaled to fill the page with invented pixels.
 */
/*
 * Sized to the placement rather than to the sheet, and without --size=down.
 * The placement is already capped at the image's natural size, so refusing to
 * enlarge here would only reintroduce the dependence on resolution that the
 * placement exists to remove.
 *
 * --fail-on=error is the one stage that reads the photograph, and it is where
 * this action stops taking a tool's exit status as evidence of what it was
 * asked to do. libvips is permissive by default: measured, a JPEG cut off
 * inside its image data is salvaged into a partial picture, vips exits zero,
 * and every check after this one passes -- the file exists, the page is
 * written, the PDF validates strictly -- so half a photograph is published as
 * a finished conversion. The level named is the one that covers truncation
 * and serious decoding errors; "warning" would also refuse files that merely
 * have a quirk, which is a different decision about what a photograph is.
 *
 * Checked in preflight as well. A flag the run depends on that the probe does
 * not exercise is how a vips too old to accept it fails in the middle of a
 * conversion instead of before one.
 */
const FAIL_ON_DAMAGE = "--fail-on=error";

function buildThumbnailArgv(vipsPath, inputPath, outputPath, placement) {
    return [
        vipsPath,
        "thumbnail",
        inputPath,
        outputPath,
        String(placement.widthPixels),
        `--height=${placement.heightPixels}`,
        "--export-profile=srgb",
        FAIL_ON_DAMAGE
    ];
}

/*
 * Single-page formats have no n-pages field at all, so its absence means one
 * page. TIFF, HEIC and AVIF can carry more.
 */
function buildPageCountArgv(vipsheaderPath, imagePath) {
    return [vipsheaderPath, "-f", "n-pages", imagePath];
}

function buildFlattenArgv(vipsPath, inputPath, outputPath, background) {
    return [
        vipsPath,
        "flatten",
        inputPath,
        outputPath,
        `--background=${backgroundVector(background)}`
    ];
}

function buildGravityArgv(vipsPath, inputPath, outputPath, options) {
    const { geometry, quality, background } = options;
    const validQuality = parseInteger(
        quality,
        MINIMUM_QUALITY,
        MAXIMUM_QUALITY,
        "Quality"
    );

    return [
        vipsPath,
        "gravity",
        inputPath,
        `${outputPath}[Q=${validQuality},keep=none]`,
        "centre",
        String(geometry.widthPixels),
        String(geometry.heightPixels),
        "--extend=background",
        `--background=${backgroundVector(background)}`
    ];
}

/*
 * After the thumbnail stage every image is sRGB with three bands or four, so
 * an even count means an alpha channel is present. The JPEG page saver cannot
 * represent alpha, so those must be flattened onto the chosen background
 * first.
 *
 * Two bands should not arise at all: measured, --export-profile=srgb turns a
 * one-band source into three and a two-band one into four, so a greyscale
 * photograph with transparency arrives here as RGBA. It is still answered,
 * because that measurement is of one version of vips on one machine and the
 * cost of it being wrong is an alpha channel reaching a saver that cannot
 * hold one.
 *
 * This deliberately ignores the file extension: what matters is what the
 * decoded image actually holds.
 */
function hasAlphaBand(bandCount) {
    const bands = Number(bandCount);

    return bands === GREY_ALPHA_BANDS || bands >= RGB_ALPHA_BANDS;
}

module.exports = {
    FAIL_ON_DAMAGE,
    buildThumbnailArgv,
    buildPageCountArgv,
    buildFlattenArgv,
    buildGravityArgv,
    hasAlphaBand
};
