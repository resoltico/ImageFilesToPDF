"use strict";

/*
 * Which file is which, in the fake filesystem.
 *
 * The runtime proves a publication by comparing what the output path holds
 * against what it published, so the fake has to keep the same distinctions
 * the filesystem does: a hard link is the same file under another name, a
 * rename carries the file along, and a copy is a different file that happens
 * to have the same contents. A fake that answered "the same" to all three
 * could not tell a published PDF from somebody else's.
 */

// One volume, and file numbers handed out as they are first asked for.
const DEVICE = 16777232;

function createIdentities() {
    const numbers = new Map();
    let next = 1;

    return {
        of(path) {
            if (!numbers.has(path)) {
                numbers.set(path, next);
                next += 1;
            }

            return `${DEVICE}:${numbers.get(path)}`;
        },

        // A rename: the same file, reached by another name.
        carry(from, to) {
            this.of(from);
            numbers.set(to, numbers.get(from));
            numbers.delete(from);
        },

        // A hard link: both names, one file.
        share(from, to) {
            this.of(from);
            numbers.set(to, numbers.get(from));
        },

        forget(path) {
            numbers.delete(path);
        }
    };
}

module.exports = { createIdentities, DEVICE };
