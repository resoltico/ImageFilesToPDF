"use strict";

/*
 * Loaded into an engine or CLI child with --require, this injects the one
 * fault named by IFTP_TEST_FAULT: a race or an operating-system failure that a
 * real run cannot be made to produce on cue. Everything else stays real.
 */

const fs = require("node:fs");

const FAULTS = {
    // A process that cannot install its signal handlers.
    "signal-handlers"() {
        const listen = process.on;
        process.on = function on(event, listener) {
            if (String(event).startsWith("SIG")) { throw new Error("Injected: signal handlers are unavailable."); }
            return listen.call(this, event, listener);
        };
    },
    // Standard input that cannot be read from at all.
    "stdin-unreadable"() {
        process.stdin.pipe = () => { throw new Error("Injected: standard input is unavailable."); };
    },
    // The settings file is replaced by something else between its stat and its open.
    "settings-replaced"() {
        const { fstatSync } = fs;
        fs.fstatSync = (...args) => Object.assign(fstatSync(...args), { isFile: () => false });
    }
};

const fault = FAULTS[process.env.IFTP_TEST_FAULT];
if (!fault) { throw new Error(`Unknown injected fault: ${process.env.IFTP_TEST_FAULT}`); }
fault();
