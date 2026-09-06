"use strict";

/*
 * The in-memory filesystem behind the fake host.
 *
 * Only the argument each tool actually writes is created, so a stage that
 * reports success without producing its output is detected exactly as it
 * would be in production.
 */

/*
 * Only the argument each tool actually writes is created. Creating every
 * path-shaped argument would make verifyFileWritten unfailable, and a stage
 * that silently produced nothing would go unnoticed.
 *
 *   vips <operation> <in> <out> ...
 *   pdfcpu import -- <description> <out> <page>...
 */
function produceOutput(files, argv, command) {
    if (!command.includes("pdfcpu")) {
        files.add(String(argv[3]).replace(/\[.*$/u, ""));

        return "";
    }

    if (argv[1] === "import") {
        files.add(argv[4]);
    } else if (!files.has(argv.at(-1))) {
        // pdfcpu validate on a missing file fails, as it does for real.
        throw new Error("no such file");
    }

    return "";
}

/*
 * Every file has a size, because a copy is verified by comparing the source
 * with the destination. A real size is not needed, only a consistent one: the
 * default stands for "some bytes", and a file listed as empty has none.
 */
const DEFAULT_SIZE = 1024;

function sizeOf(state, path) {
    if (state.emptyFiles.has(path)) {
        return 0;
    }

    return state.sizes.has(path) ? state.sizes.get(path) : DEFAULT_SIZE;
}

function operands(rest) {
    return rest.filter((argument) => !argument.startsWith("-"));
}

// -e asks whether the path exists, -s whether it is also non-empty.
function testPath(state, [flag, target]) {
    if (flag === "-x") {
        if (!state.runnable.has(target)) {
            throw new Error("not executable");
        }

        return "";
    }

    if (!state.files.has(target) || (flag === "-s" && state.emptyFiles.has(target))) {
        throw new Error("test failed");
    }

    return "";
}

// mv -n declines silently when the destination already exists.
function move(state, rest) {
    const [source, destination] = operands(rest);

    if (!state.files.has(destination) && state.files.has(source)) {
        state.files.delete(source);
        state.files.add(destination);
        state.sizes.set(destination, sizeOf(state, source));
        state.sizes.delete(source);
    }

    return "";
}

// cp -n declines silently too, and leaves the source in place.
function copy(state, rest) {
    const [source, destination] = operands(rest);

    if (!state.files.has(source)) {
        throw new Error("cp: no such file");
    }

    if (!state.files.has(destination)) {
        state.files.add(destination);
        state.sizes.set(destination, sizeOf(state, source));
    }

    return "";
}

function stat(state, rest) {
    const target = operands(rest).at(-1);

    if (!state.files.has(target)) {
        throw new Error("stat: no such file");
    }

    return String(sizeOf(state, target));
}

function remove(state, rest) {
    operands(rest).forEach((target) => state.files.delete(target));

    return "";
}

function createFilesystem(seed, executables, empty) {
    const state = {
        files: new Set(seed),
        runnable: new Set(executables),
        emptyFiles: new Set(empty),
        sizes: new Map()
    };

    return {
        files: state.files,
        sizes: state.sizes,
        test: (rest) => testPath(state, rest),
        move: (rest) => move(state, rest),
        copy: (rest) => copy(state, rest),
        stat: (rest) => stat(state, rest),
        remove: (rest) => remove(state, rest),
        produce: (argv, command) => produceOutput(state.files, argv, command)
    };
}

module.exports = { createFilesystem };
