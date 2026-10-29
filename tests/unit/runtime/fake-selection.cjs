"use strict";
const { collectImageFiles: collect } = require("../../../src/runtime/admission.js");
const { treeOf } = require("./fake-tree.cjs");
function collectImageFiles(app, items, tree = treeOf({})) { return collect(app, items, tree); }
module.exports = { collectImageFiles };
