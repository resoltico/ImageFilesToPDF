"use strict";
const { collectImageFiles: collect } = require("../../../src/application/admission.js");
const { treeOf } = require("./fake-tree.cjs");
const { runOperations } = require("../../support/macos-conversion/host/run-operations.js");
async function collectImageFiles(app, items, tree = treeOf({})) { const ports = runOperations(app); return (await collect(ports, items.map(ports.resolve), tree)); }
module.exports = { collectImageFiles };
