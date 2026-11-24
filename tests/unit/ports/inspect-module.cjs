"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { compileFunction } = require("node:vm");

const sourceRoot = fs.realpathSync(path.resolve(__dirname, "../../../src"));

// Exercise private code from its owner without publishing a runtime API for tests.
function inspectModule(filename, names) {
    const resolved = fs.realpathSync(filename);
    if (!resolved.startsWith(sourceRoot + path.sep) || names.some((name) => !/^[A-Za-z_$][\w$]*$/u.test(name))) {
        throw new Error("The fixture requires a source module and literal binding names.");
    }
    const module = { exports: {} };
    const contents = fs.readFileSync(resolved, "utf8");
    const evaluate = compileFunction(`${contents}\nreturn { ${names.join(", ")} };`, ["require", "module", "exports"], { filename: resolved });
    return evaluate(createRequire(resolved), module, module.exports);
}

module.exports = { inspectModule };
