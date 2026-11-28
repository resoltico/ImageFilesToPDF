"use strict";

/*
 * What the product is: its name, the command it installs, its version, where
 * it lives, and the oldest Node.js it runs on.
 *
 * package.json owns all but the display name; npm needs them there. They are
 * read from it rather than copied, and a bundle carries only these fields
 * (tools/scoped-bundle.mjs), so the shipped artifact says which build it is
 * without the development manifest. A pasted Shortcut cannot be checked
 * against dist/SHA256SUMS, so the version it shows is how to tell.
 */
const { name, version, homepage, engines } = require("../../package.json");

const APP_NAME = "Image Files to PDF";
const COMMAND = name;
const VERSION = version;
const PROJECT_URL = homepage;
// engines.node is ">=x.y.z"; tools/lint/consistency.mjs holds it to that form.
const MINIMUM_NODE_VERSION = engines.node.slice(">=".length);

module.exports = { APP_NAME, COMMAND, VERSION, PROJECT_URL, MINIMUM_NODE_VERSION };
