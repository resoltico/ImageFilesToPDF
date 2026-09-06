"use strict";

/*
 * The job the page and PDF tests run against: A4 portrait at 72 DPI, with
 * the tools in fixed places so a command can be compared literally.
 */

const { calculatePageGeometry } = require("../../../src/core/geometry.js");

const geometry = calculatePageGeometry({
    paperSize: "A4",
    orientation: "Portrait",
    dpi: 72,
    quality: 85,
    mode: "Single PDF",
    background: "#FFFFFF"
});

function makeJob(app) {
    return {
        app,
        geometry,
        settings: { quality: 85, background: "#FFFFFF" },
        timestamp: "20260904_010203",
        workspace: "/tmp/ImageFilesToPDF.X",
        tools: { vips: "/v/vips", vipsheader: "/v/vipsheader", pdfcpu: "/v/pdfcpu" }
    };
}

module.exports = { geometry, makeJob };
