"use strict";

const { operands, sizeOf } = require("./fake-measuring.cjs");

/*
 * What the tools that change the filesystem do, modelled from the real ones.
 *
 * The distinctions matter to the code under test: ln makes another name for
 * one file and refuses a name that is taken, mv carries a file along and
 * without -n replaces what it finds, cp makes a different file, and the
 * shell's noclobber redirection takes a name only if nothing is there.
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

/*
 * sh -c 'set -C; : > "$0"' path: the shell's exclusive create. It takes a
 * free name and refuses a file, a folder, or a link whose target is gone --
 * measured, on APFS and on a FAT-formatted volume alike.
 */
function reserve(state, rest) {
    const target = rest.at(-1);

    if (state.files.has(target) || state.directories.has(target) ||
        state.danglingLinks.has(target)) {
        throw new Error(`sh: ${target}: cannot overwrite existing file`);
    }

    state.files.add(target);
    state.sizes.set(target, 0);

    return "";
}

// mv -n declines silently when the destination already exists.
function move(state, rest) {
    const [source, target] = operands(rest);
    const destination = resolveDestination(state, source, target);

    // Without -n a rename replaces what is at the destination, which is
    // only ever this run's own reservation.
    const replacing = !rest.includes("-n");

    if ((replacing || !state.files.has(destination)) && state.files.has(source)) {
        state.files.delete(source);
        state.files.add(destination);
        state.sizes.set(destination, sizeOf(state, source));
        state.sizes.delete(source);
        state.identities.carry(source, destination);
    }

    return "";
}

/*
 * A copy is a different file with the same contents, and it leaves the source
 * in place. Without -n it overwrites what is at the destination -- which, in
 * this code, is only ever this run's own reservation.
 */
function copy(state, rest) {
    const [source, target] = operands(rest);
    const destination = resolveDestination(state, source, target);

    if (!state.files.has(source)) {
        throw new Error("cp: no such file");
    }

    if (rest.includes("-n") && state.files.has(destination)) {
        throw new Error(`cp: ${destination}: File exists`);
    }

    state.files.add(destination);
    state.sizes.set(destination, sizeOf(state, source));
    state.identities.forget(destination);

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

module.exports = { move, copy, link, reserve, remove };
