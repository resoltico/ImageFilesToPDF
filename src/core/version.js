"use strict";
const { formatList } = require("./formatting.js");
const { issueMessage, message } = require("./messages.js");
const { INSTALL_GUIDES } = require("./installation-guide.js");

/*
 * The released version, shown to the user on completion.
 *
 * A pasted Shortcut cannot be checked against dist/SHA256SUMS, so this is the
 * only way to tell which build is actually installed. It is declared here
 * rather than injected by the bundler so that src/ stays the source of truth;
 * tools/lint/consistency.mjs asserts it agrees with package.json.
 */
const APP_NAME = "Image Files to PDF";
const VERSION = "4.0.0";

const MINIMUM_NODE_VERSION = "26.13.1";

function supportsNode(version) {
    const match = /^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u.exec(version);
    if (!match) { return false; }
    const actual = [match.groups.major, match.groups.minor, match.groups.patch].map(Number);
    for (const [index, minimum] of MINIMUM_NODE_VERSION.split(".").map(Number).entries()) {
        if (actual[index] !== minimum) { return actual[index] > minimum; }
    }
    return true;
}

function runtimeUnavailableIssue(found) {
    const params = { minimum: MINIMUM_NODE_VERSION, found };
    const id = found.length > 0 ? "runtimeUnavailableFound" : "runtimeUnavailable";
    const list = formatList(found.map(({ path, version }) =>
        version ? message("runtimePathVersion", { path, version }) : path));
    return { ...issueMessage("runtime-unavailable", "setup", id, { ...params, list, guide: INSTALL_GUIDES.darwin }), params };
}

module.exports = { APP_NAME, VERSION, MINIMUM_NODE_VERSION, supportsNode, runtimeUnavailableIssue };
