"use strict";

const { move } = require("./fake-writing.cjs");

/*
 * The two ways this code takes a name exclusively.
 *
 * Both refuse rather than overwrite, which is where the promise not to
 * overwrite anything comes from -- so the fake has to refuse in the same
 * places the real ones do, and to know only the script it is actually given.
 */

/*
 * mkdir either makes the directory or fails, and it fails for anything
 * already at that name -- a file, a folder, a link, a named pipe. Measured,
 * all four, which is what makes everything inside one this run's own.
 */
function makeDirectory(state, rest) {
    const target = rest.at(-1);

    if (state.files.has(target) || state.directories.has(target) ||
        state.danglingLinks.has(target)) {
        throw new Error(`mkdir: ${target}: File exists`);
    }

    state.directories.add(target);

    return "";
}

// rmdir removes an empty directory and refuses one that is not, so a
// directory something else has written into is left alone.
function removeDirectory(state, rest) {
    const target = rest.at(-1);

    if ([...state.files].some((file) => file.startsWith(`${target}/`))) {
        throw new Error(`rmdir: ${target}: Directory not empty`);
    }

    state.directories.delete(target);

    return "";
}

/*
 * renamex_np with RENAME_EXCL: one step that moves the file and refuses a
 * destination that is already there, whatever kind of thing it is. The file
 * keeps the number that identifies it, which is what a publication is proved
 * by afterwards.
 */
function exclusiveRename(state, from, to) {
    if (state.files.has(to) || state.directories.has(to) ||
        state.danglingLinks.has(to) || !state.files.has(from)) {
        return false;
    }

    move(state, [from, to]);

    return true;
}

module.exports = { makeDirectory, removeDirectory, exclusiveRename };
