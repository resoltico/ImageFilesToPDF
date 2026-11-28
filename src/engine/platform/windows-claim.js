"use strict";
const fs = require("node:fs");
const { dirname } = require("../../core/paths.js");
const { BIGINT, identity, UNKNOWN_FILE } = require("../filesystem.js");

// Win32 error codes returned by MoveFileExW.
const MOVE_ERRORS = { 1: "denied", 5: "denied", 17: "denied", 19: "denied", 50: "denied", 80: "exists", 112: "denied", 183: "exists" };
const noEntry = { throwIfNoEntry: false };

function same(actual, expected) {
    return Boolean(actual.identity) && actual.identity === expected.identity && actual.size === expected.size;
}

function heldFacts(fd) {
    const stat = fs.fstatSync(fd, BIGINT);
    const size = Number(stat.size);
    return stat.isFile() && Number.isSafeInteger(size) ? { identity: identity(stat), size } : UNKNOWN_FILE;
}

function refusal(reported, to) {
    const present = fs.lstatSync(to, noEntry);
    const state = MOVE_ERRORS[reported.code];
    if (state === "exists" && present) { return { state: "exists" }; }
    if (state === "denied" && !present) { return { state: "denied", diagnostic: reported }; }
    return { state: "unknown", diagnostic: reported };
}

function windowsClaim(windows, directoryIdentity, facts, remember) {
    return async (from, to) => {
        const source = dirname(from), target = dirname(to);
        const sourceParent = directoryIdentity(source), targetParent = directoryIdentity(target);
        const original = facts(from);
        const fd = fs.openSync(from, "r");
        const held = () => heldFacts(fd);
        let handedOff = false;
        async function attempt() {
            if (!same(held(), original) || !same(facts(from), original)) { return { state: "unknown" }; }
            const reported = await windows.move(from, to);
            if (sourceParent !== directoryIdentity(source) || targetParent !== directoryIdentity(target)) {
                return { state: "unknown", diagnostic: reported };
            }
            if (!reported.ok && same(facts(from), original) && same(held(), original)) { return refusal(reported, to); }
            // FAT file IDs can change on rename. The open handle follows the same object.
            if (reported.ok && reported.value === true && !fs.lstatSync(from, noEntry)) {
                const claimed = held();
                if (claimed.size === original.size && same(facts(to), claimed)) {
                    remember(to, targetParent, held);
                    handedOff = true;
                    return { state: "created", claimed, close: () => fs.closeSync(fd) };
                }
            }
            return { state: "unknown", diagnostic: reported };
        }
        try { return await attempt().catch((error) => ({ state: "unknown", diagnostic: { message: error.message } })); }
        finally { if (!handedOff) { fs.closeSync(fd); } }
    };
}

module.exports = { windowsClaim };
