"use strict";

/*
 * The names this product keeps its data under on each platform. They say
 * where data lives, which is a different fact from the name people see:
 * APP_NAME in product.js may change without moving anyone's data.
 */
// The folder in macOS Application Support and in Windows LocalAppData.
const DATA_FOLDER = "Image Files to PDF";
// The folder in the XDG state directory on Linux.
const STATE_FOLDER = "image-files-to-pdf";
// The macOS user defaults domain of the Finder action.
const PREFERENCES_DOMAIN = "com.resoltico.ImageFilesToPDF";

module.exports = { DATA_FOLDER, STATE_FOLDER, PREFERENCES_DOMAIN };
