"use strict";
const { positiveIntegerFrom } = require("../core/numbers.js");
const { OperationError } = require("../core/errors.js");
const { sourceIssue, orientedSize } = require("../core/source-policy.js");
const LOADERS = { jpegload: "JPEG", pngload: "PNG", tiffload: "TIFF", heifload: "HEIF", webpload: "WebP" };
const REQUIRED_FIELDS = ["width", "height", "bands", "vips-loader", "interpretation"];
const OPTIONAL_FIELDS = ["orientation", "n-pages", "icc-profile-data"];
const FIELD = /^(?<field>width|height|bands|vips-loader|n-pages|icc-profile-data|interpretation|orientation):[ \t]*(?<value>.*)$/u;
const PATH_SEPARATOR = ": ";
const HEADER = /^(?<path>.+):[ \t]+\d+x\d+[ \t]/u;

function normalized(text) { return String(text).replace(/\r\n?/gu, "\n"); }

function metadataError(message) {
    const error = new OperationError(message);
    error.issues = [sourceIssue("damaged", {}, { message })];
    return error;
}

function addField(fields, line) {
    const match = FIELD.exec(line);
    if (match) {
        const { field, value } = match.groups;
        if (Object.hasOwn(fields, field)) { throw metadataError(`Duplicate image metadata field: ${field}`); }
        fields[field] = value.trim();
    }
}

function interpretationFrom(value) {
    const text = String(value ?? "").trim();
    const match = /^\(\(VipsInterpretation\) VIPS_INTERPRETATION_(?<name>\w+)\)$/u.exec(text);
    return match ? match.groups.name.toLowerCase().replace(/_/gu, "-") : text;
}

function rawMetadata(fields) {
    const loader = (fields["vips-loader"] ?? "").replace(/_buffer$/u, "");
    const orientation = fields.orientation === undefined ? 1 : positiveIntegerFrom(fields.orientation);
    return { loader, format: LOADERS[loader],
        width: positiveIntegerFrom(fields.width), height: positiveIntegerFrom(fields.height),
        bands: positiveIntegerFrom(fields.bands), orientation,
        pages: fields["n-pages"] === undefined ? 1 : positiveIntegerFrom(fields["n-pages"]),
        icc: Object.hasOwn(fields, "icc-profile-data"), interpretation: interpretationFrom(fields.interpretation) };
}

/** Exact filename removal prevents embedded newlines in a filename becoming metadata. */
function readMetadata(text, path = "") {
    let body = normalized(text);
    const name = normalized(path);
    if (name && body.startsWith(`${name}: `)) {
        const end = body.indexOf("\n", name.length);
        body = end < 0 ? "" : body.slice(end + 1);
    }
    if (name) { body = body.replace(`filename: ${name}\n`, ""); }
    const fields = {};
    for (const line of body.split("\n")) { addField(fields, line); }
    return { raw: rawMetadata(fields), optional: OPTIONAL_FIELDS.filter((field) => Object.hasOwn(fields, field)) };
}

/** Parse each header block once, in argv order. Ambiguity triggers per-file fallback. */
function readMetadataBatch(text, paths) {
    const records = new Map(paths.map((path) => [path, {}]));
    let current = "";
    let index = 0;
    for (const line of normalized(text).split("\n")) {
        const header = HEADER.exec(line);
        if (header && records.has(header.groups.path)) {
            current = header.groups.path;
            if (paths[index] !== current) { throw metadataError("Image metadata blocks are ambiguous or out of order."); }
            index += 1;
        } else if (current && line.startsWith(`${current}: `)) {
            addField(records.get(current), line.slice(current.length + PATH_SEPARATOR.length));
        }
    }
    if (index !== paths.length) { throw metadataError("Image metadata blocks are incomplete."); }
    return paths.map((path) => {
        const fields = records.get(path);
        return { raw: rawMetadata(fields), optional: OPTIONAL_FIELDS.filter((field) => Object.hasOwn(fields, field)) };
    });
}

function finishMetadata(raw) {
    return { ...raw, ...orientedSize(raw.width, raw.height, raw.orientation) };
}

function optionalValue(raw, field, value) {
    if (field === "orientation") { return { ...raw, orientation: value === undefined ? 1 : positiveIntegerFrom(value) }; }
    if (field === "n-pages") { return { ...raw, pages: value === undefined ? 1 : positiveIntegerFrom(value) }; }
    if (field === "icc-profile-data") { return { ...raw, icc: value !== undefined }; }
    throw new Error("Unknown optional image metadata field.");
}

function scalarValues(text, expected) {
    const lines = normalized(text).trim().split("\n");
    if (lines.length !== expected || lines.some((line) => line.trim() === "")) { throw metadataError("The image field response is incomplete or ambiguous."); }
    return lines.map((line) => line.trim());
}

function fieldAbsent(text, field) {
    const name = `field "${field}" not found`;
    return normalized(text).split("\n").some((line) => line.trim() === `vips_image_get: ${name}` || line.trim() === `vipsheader: vips_image_get: ${name}`);
}

function headerFailureCode(text) {
    return /(?:^|\n)(?:vipsheader:[ \t]*)?(?:VipsJpeg|VipsPng|VipsTiff|VipsHeif|VipsWebP):/u.test(normalized(text))
        ? "damaged" : "not-an-image";
}
module.exports = { REQUIRED_FIELDS, OPTIONAL_FIELDS, readMetadata, readMetadataBatch, rawMetadata, finishMetadata, optionalValue, scalarValues, fieldAbsent, headerFailureCode };
