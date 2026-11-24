"use strict";
const MINIMUM_NODE_VERSION = "26.13.1";

function supportedNode(version) {
    const actual = version.split(".").map(Number);
    const minimum = MINIMUM_NODE_VERSION.split(".").map(Number);
    for (const [index, required] of minimum.entries()) {
        if (actual[index] !== required) { return actual[index] > required; }
    }
    return true;
}

module.exports = { MINIMUM_NODE_VERSION, supportedNode };
