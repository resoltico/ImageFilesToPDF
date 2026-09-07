"use strict";

const { produceOutput } = require("./fake-producing.cjs");
const { testPath } = require("./fake-testing.cjs");
const { createIdentities } = require("./fake-identity.cjs");
const { operands, sizeOf, stat } = require("./fake-measuring.cjs");

/*
 * The in-memory filesystem behind the fake host.
 *
 * Only the argument each tool actually writes is created, so a stage that
 * reports success without producing its output is detected exactly as it
 * would be in production.
 */

/*
 * mv and cp into an existing directory put the file inside it under its own
 * name; they do not fail and they do not replace the directory. Measured on
 * the real filesystem, and it is how a finished PDF ended up inside a folder
 * that had taken the output path.
 */
function resolveDestination(state, source, destination) {
    if (!state.directories.has(destination)) {
        return destination;
    }

    return `${destination}/${source.slice(source.lastIndexOf("/") + 1)}`;
}

// mv -n declines silently when the destination already exists.
function move(state, rest) {
    const [source, target] = operands(rest);
    const destination = resolveDestination(state, source, target);

    if (!state.files.has(destination) && state.files.has(source)) {
        state.files.delete(source);
        state.files.add(destination);
        state.sizes.set(destination, sizeOf(state, source));
        state.sizes.delete(source);
        state.identities.carry(source, destination);
    }

    return "";
}

// cp -n declines silently too, and leaves the source in place.
function copy(state, rest) {
    const [source, target] = operands(rest);
    const destination = resolveDestination(state, source, target);

    if (!state.files.has(source)) {
        throw new Error("cp: no such file");
    }

    // A copy is a different file with the same contents.
    if (!state.files.has(destination)) {
        state.files.add(destination);
        state.sizes.set(destination, sizeOf(state, source));
    }

    return "";
}

/*
 * ln makes a second name for the same bytes and fails when the name is taken
 * -- measured, and it is what makes claiming the output path exclusive. Like
 * mv and cp it links into a directory rather than replacing it.
 */
function link(state, rest) {
    const [source, target] = operands(rest);
    const destination = resolveDestination(state, source, target);

    if (!state.files.has(source)) {
        throw new Error("ln: no such file");
    }

    if (state.files.has(destination) || state.directories.has(destination)) {
        throw new Error(`ln: ${destination}: File exists`);
    }

    state.files.add(destination);
    state.sizes.set(destination, sizeOf(state, source));
    state.identities.share(source, destination);

    return "";
}

function remove(state, rest) {
    operands(rest).forEach((target) => {
        state.files.delete(target);
        state.identities.forget(target);
    });

    return "";
}

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
        move: (rest) => move(state, rest),
        copy: (rest) => copy(state, rest),
        link: (rest) => link(state, rest),
        stat: (rest) => stat(state, rest),
        remove: (rest) => remove(state, rest),
        produce: (argv, command) => produceOutput(state, argv, command)
    };
}

module.exports = { createFilesystem };
