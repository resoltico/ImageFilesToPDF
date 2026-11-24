"use strict";

/*
 * vipsheader answers four different questions here — the dimensions that
 * decide placement, the band count, and the page count — so a matcher keyed
 * on the tool name alone would answer them all with the same number.
 */
function completeHeader(host) { return `vips-loader: ${host.loader ?? "pngload"}\nwidth: ${host.width ?? 600}\nheight: ${host.height ?? 400}\nbands: ${host.bands}\norientation: ${host.orientation ?? 1}\nn-pages: ${host.pages ?? 1}\ninterpretation: ${host.interpretation ?? "srgb"}\n${host.icc ? "icc-profile-data: 480 bytes of binary data\n" : ""}`; }

function headerField(host, field) {
    if (field === "-a") { return completeHeader(host); }
    if (field === "vips-loader") { return host.loader ?? "pngload"; }
    if (field === "interpretation") { const value = host.interpretation ?? "srgb"; const names = { srgb: "sRGB", "b-w": "B_W", scrgb: "scRGB" }; return `((VipsInterpretation) VIPS_INTERPRETATION_${names[value] ?? value.toUpperCase()})`; }
    if (field === "icc-profile-data") {
        if (!host.icc) { throw new Error('vips_image_get: field "icc-profile-data" not found'); }
        return "cHJvZmlsZQ==";
    }
    if (field === "orientation") {
        return String(host.orientation ?? 1);
    }

    if (field === "width") {
        return String(host.width ?? 600);
    }

    if (field === "height") {
        return String(host.height ?? 400);
    }

    return field === "n-pages"
        ? String(host.pages ?? 1)
        : String(host.bands);
}

module.exports = { headerField };
