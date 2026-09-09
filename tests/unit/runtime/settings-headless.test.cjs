"use strict";

/*
 * What a headless run must not do.
 *
 * A configuration file is the whole of what such a run is told, and it has to
 * mean the same thing every time it is used -- on a machine where somebody
 * has been choosing settings in a window, and on one where nobody has. So
 * that branch does not read what the last run left, does not write anything
 * for the next, and does not so much as open the place they are kept.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { settingsFor } = require("../../../src/runtime/settings-form.js");
const { encode } = require("../../../src/core/preferences.js");
const { normalizeSettings } = require("../../../src/core/settings.js");
const { createFakeHost } = require("./fake-host.cjs");

const LAST_RUN = normalizeSettings({
    paperSize: "Letter",
    orientation: "Landscape",
    mode: "separate",
    background: "#C7DAE8",
    dpi: 600,
    quality: 80
});

function memoryHolding(text) {
    const state = { wrote: [], reads: 0, opened: 0 };
    const memory = {
        recall() {
            state.reads += 1;

            return text;
        },
        remember(written) {
            state.wrote.push(written);
        }
    };

    return {
        state,
        open: () => {
            state.opened += 1;

            return memory;
        }
    };
}

// A host whose dialogs answer with whatever they are offered first, so what a
// run opens on is what it ends up with.
function acceptingHost() {
    const host = createFakeHost({});

    host.chooseFromList = (choices, options) => options.defaultItems;
    host.displayDialog = (message, options) => ({
        textReturned: options.defaultAnswer
    });

    return host;
}

test("a headless run does not open the memory at all", () => {
    // The file says what the run is. If it also depended on what somebody
    // chose in a window last week, the same file would mean two things.
    const memory = memoryHolding(encode(LAST_RUN));
    const given = {
        paperSize: "A4",
        orientation: "Portrait",
        mode: "single",
        background: "#FFFFFF",
        dpi: 300,
        quality: 92
    };
    const invocation = { headless: true, settings: given };
    const settings = settingsFor(acceptingHost(), invocation, 1, memory.open);

    assert.deepEqual(settings, normalizeSettings(given));
    assert.equal(memory.state.opened, 0, "nothing was opened");
    assert.equal(memory.state.reads, 0, "nothing was read");
    assert.deepEqual(memory.state.wrote, [], "and nothing was written");
});

test("a headless configuration that is not settings is refused, not asked about", () => {
    // A file holding `false` or `0` is not an interactive run. Deciding by
    // whether the settings look like anything sent one to the dialogs, where
    // it opened a window and waited for an answer nobody was there to give --
    // measured, as a headless run that never returned.
    const host = acceptingHost();
    let asked = 0;

    host.chooseFromList = () => {
        asked += 1;

        return false;
    };

    for (const configuration of [false, 0, "", "not settings"]) {
        const memory = memoryHolding(encode(LAST_RUN));

        assert.throws(
            () => settingsFor(host, { headless: true, settings: configuration }, 1, memory.open),
            /Unsupported|must be/u,
            JSON.stringify(configuration)
        );
        assert.equal(memory.state.opened, 0);
    }

    assert.equal(asked, 0, "and nobody was asked anything");
});
