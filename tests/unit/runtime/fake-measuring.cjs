"use strict";

/*
 * What stat says about a path in the fake filesystem, and the arguments the
 * tools take it from.
 */

function operands(rest) {
    return rest.filter((argument) => !argument.startsWith("-"));
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

// -f%z is the size alone; -f%d:%i:%z is which file it is and how large.
const IDENTIFYING = "-f%d:%i:%z";

function stat(state, rest) {
    const target = operands(rest).at(-1);

    if (!state.files.has(target) && !state.directories.has(target)) {
        throw new Error("stat: no such file");
    }

    const size = sizeOf(state, target);

    return rest.includes(IDENTIFYING)
        ? `${state.identities.of(target)}:${size}`
        : String(size);
}

module.exports = { operands, sizeOf, stat };
