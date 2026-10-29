"use strict";
const { SUPPORTED_FORMATS } = require("./paths.js");
const RASTER_FAMILIES = new Set(SUPPORTED_FORMATS.map((format) => format.family ?? format.name));

/** @typedef {{path:string, identity:string, version:string, format:string, pages:number, width:number, height:number, bands:number}} SourceDescriptor
 * identity/version describe the original capture observation; path denotes the owned bytes inspected and decoded.
 */
function sourceIssues(descriptor) {
    if (!RASTER_FAMILIES.has(descriptor.format)) {
        return [{ code: "source-format", stage: "inspection", message: "Only supported still raster images can be converted." }];
    }
    if (!Number.isInteger(descriptor.pages) || descriptor.pages < 1) {
        return [{ code: "source-count", stage: "inspection", message: "The source image count is unknown." }];
    }
    if (descriptor.pages !== 1) {
        return [{ code: "source-multiple", stage: "inspection", message: `contains ${descriptor.pages} pages. Only single-page images are supported; split the file and run the action on the pages.` }];
    }
    return [];
}
module.exports = { sourceIssues };
