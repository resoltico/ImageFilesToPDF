"use strict";

/*
 * The product's identity comes from package.json, read here on its own so the
 * expectation does not share the module's reading of it.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const product = require("../../../src/core/product.js");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../package.json"), "utf8"));

test("the name, version, project and Node floor are package.json's", () => {
    assert.deepEqual(product, {
        APP_NAME: "Image Files to PDF",
        COMMAND: manifest.name,
        VERSION: manifest.version,
        PROJECT_URL: manifest.homepage,
        MINIMUM_NODE_VERSION: manifest.engines.node.replace(/^>=/u, "")
    });
    assert.match(product.VERSION, /^\d+\.\d+\.\d+$/u, "shown to the user, so exactly a version");
    assert.match(product.MINIMUM_NODE_VERSION, /^\d+\.\d+\.\d+$/u);
});

test("data lives under names of its own, not under the display name", () => {
    // Durable: these are where people's settings, workspaces and the Finder engine are.
    const { DATA_FOLDER, STATE_FOLDER, PREFERENCES_DOMAIN } = require("../../../src/core/data-locations.js");
    assert.deepEqual([DATA_FOLDER, STATE_FOLDER, PREFERENCES_DOMAIN], ["Image Files to PDF", "image-files-to-pdf", "com.resoltico.ImageFilesToPDF"]);
});
