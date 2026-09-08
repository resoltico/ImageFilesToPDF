"use strict";

const { produceOutput } = require("./fake-producing.cjs");
const { testPath } = require("./fake-testing.cjs");
const { createIdentities } = require("./fake-identity.cjs");
const { stat } = require("./fake-measuring.cjs");
const { move, copy, link, remove } = require("./fake-writing.cjs");
const {
    makeDirectory,
    removeDirectory,
    shell,
    exclusiveRename
} = require("./fake-taking.cjs");

/*
 * The in-memory filesystem behind the fake host.
 *
 * Only the argument each tool actually writes is created, so a stage that
 * reports success without producing its output is detected exactly as it
 * would be in production.
 */

function createFilesystem(seed, executables, empty, settings = {}) {
    const state = {
        files: new Set(seed),
        directories: new Set(settings.directories ?? []),
        danglingLinks: new Set(settings.danglingLinks ?? []),
        pages: new Map(),
        runnable: new Set(executables),
        emptyFiles: new Set(empty),
        sizes: new Map(),
        identities: createIdentities()
    };

    return {
        files: state.files,
        sizes: state.sizes,
        test: (rest) => testPath(state, rest),
        exclusiveRename: (from, to) => exclusiveRename(state, from, to),
        makeDirectory: (rest) => makeDirectory(state, rest),
        removeDirectory: (rest) => removeDirectory(state, rest),
        shell: (rest) => shell(state, rest),
        move: (rest) => move(state, rest),
        copy: (rest) => copy(state, rest),
        link: (rest) => link(state, rest),
        stat: (rest) => stat(state, rest),
        remove: (rest) => remove(state, rest),
        produce: (argv, command) => produceOutput(state, argv, command)
    };
}

module.exports = { createFilesystem };
