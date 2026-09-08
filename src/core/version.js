"use strict";

/*
 * The released version, shown to the user on completion.
 *
 * A pasted Shortcut cannot be checked against dist/SHA256SUMS, so this is the
 * only way to tell which build is actually installed. It is declared here
 * rather than injected by the bundler so that src/ stays the source of truth;
 * tools/lint/consistency.mjs asserts it agrees with package.json.
 */
const APP_NAME = "Image Files to PDF";
const VERSION = "1.2.6";

module.exports = { APP_NAME, VERSION };
