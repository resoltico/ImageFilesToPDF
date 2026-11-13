"use strict";

/*
 * The formats vips reads that behave like a photograph: one still image, of
 * known orientation, that belongs on a page.
 *
 * Deliberately excluded, though vips can read them: GIF and animated WebP
 * (only the first frame would be taken), SVG (vector, and --size=down would
 * leave an icon-sized file as a stamp on the page), PDF (rasterizing page one
 * of a PDF to make a PDF), and camera RAW (slow, huge, and users expect
 * processing rather than conversion).
 *
 * The pattern and the list shown to the user are both derived from this table,
 * so a dialog cannot promise a format the filter would reject.
 */
const SUPPORTED_FORMATS = [
    { name: "JPEG", family: "JPEG", pageEncoding: "jpeg", extensions: ["jpg", "jpeg"] },
    { name: "PNG", family: "PNG", pageEncoding: "png", extensions: ["png"] },
    { name: "HEIC", family: "HEIF", pageEncoding: "jpeg", extensions: ["heic", "heif"] },
    { name: "TIFF", family: "TIFF", pageEncoding: "png", extensions: ["tif", "tiff"] },
    { name: "WebP", family: "WebP", pageEncoding: "jpeg", extensions: ["webp"] },
    { name: "AVIF", family: "HEIF", pageEncoding: "jpeg", extensions: ["avif"] }
];

const SUPPORTED_EXTENSIONS = SUPPORTED_FORMATS.flatMap(
    (format) => format.extensions
);

const SUPPORTED_PATTERN = new RegExp(
    `\\.(?:${SUPPORTED_EXTENSIONS.join("|")})$`,
    "iu"
);

function isSupportedImage(path) {
    return SUPPORTED_PATTERN.test(String(path));
}

/*
 * "JPEG, PNG, HEIC, TIFF, WebP or AVIF". Worth spelling out to the user,
 * because the action refuses things people reasonably try, such as GIF and
 * PDF, and "no images selected" alone would not explain why.
 */
function supportedFormatList() {
    const names = SUPPORTED_FORMATS.map((format) => format.name);

    return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

module.exports = { SUPPORTED_FORMATS, supportedFormatList, isSupportedImage };
