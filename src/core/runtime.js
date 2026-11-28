"use strict";
const { formatList } = require("./formatting.js");
const { issueMessage, message } = require("./messages.js");
const { INSTALL_GUIDES } = require("./installation-guide.js");
const { MINIMUM_NODE_VERSION } = require("./product.js");

// Whether a Node.js version string is at least the product's floor.
function supportsNode(version) {
    const match = /^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u.exec(version);
    if (!match) { return false; }
    const actual = [match.groups.major, match.groups.minor, match.groups.patch].map(Number);
    for (const [index, minimum] of MINIMUM_NODE_VERSION.split(".").map(Number).entries()) {
        if (actual[index] > minimum) { return true; }
        if (actual[index] < minimum) { return false; }
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

module.exports = { supportsNode, runtimeUnavailableIssue };
