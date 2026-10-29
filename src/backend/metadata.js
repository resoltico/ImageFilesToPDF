"use strict";
const { positiveIntegerFrom } = require("../core/numbers.js");
const FIRST_TURNED = 5;
const LAST_ORIENTATION = 8;
const LOADERS = { jpegload: "JPEG", pngload: "PNG", tiffload: "TIFF", heifload: "HEIF", webpload: "WebP" };

function metadataField(text, field, path = "") {
    const normalized = String(text).replace(/\r\n?/gu, "\n");
    const marker = `${path ? `${path}: ` : ""}${field}: `;
    const at = `\n${normalized}`.indexOf(`\n${marker}`);
    return at < 0 ? null : `\n${normalized}`.slice(at + marker.length + 1).split("\n")[0].trim();
}

function readMetadata(text, path = "") {
    const field = (name) => metadataField(text, name, path);
    const loader = (field("vips-loader") ?? "").replace(/_buffer$/u, "");
    const orientation = field("orientation");
    const width = positiveIntegerFrom(field("width"));
    const height = positiveIntegerFrom(field("height"));
    const turned = orientation !== null && Number(orientation) >= FIRST_TURNED && Number(orientation) <= LAST_ORIENTATION;
    return { loader, format: LOADERS[loader], width: turned ? height : width, height: turned ? width : height,
        bands: positiveIntegerFrom(field("bands")), orientation: orientation === null ? 1 : positiveIntegerFrom(orientation),
        pages: field("n-pages") === null ? 1 : positiveIntegerFrom(field("n-pages")),
        icc: field("icc-profile-data") !== null, interpretation: field("interpretation") ?? "" };
}
module.exports = { metadataField, readMetadata };
