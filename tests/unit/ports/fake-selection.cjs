"use strict";

const { collectImageFiles: collect } = require("../../../src/application/admission.js");
const { classifyInput } = require("../../../src/core/input-items.js");
const { selectionRefusal } = require("../../../src/core/selection-policy.js");
const { treeOf } = require("./fake-tree.cjs");

function resolve(value) {
    const item = classifyInput(String(value));
    return item.path ? { path: item.path } : { refusal: selectionRefusal("", item.kind, value) };
}

function collectImageFiles({ unavailable = [] }, items, tree = treeOf({})) {
    const ports = { fileKind: (path) => unavailable.includes(path) ? "unavailable" : "file" };
    return collect(ports, items.map(resolve), tree);
}

module.exports = { collectImageFiles };
