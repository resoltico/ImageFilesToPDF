"use strict";

/*
 * Which runs remember, and which must not.
 *
 * A configuration file is the whole of what a headless run is told, and it
 * has to mean the same thing every time it is used -- so that branch neither
 * reads what the last run left nor writes anything for the next. An
 * interactive run does both, and saves only what it has validated.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { settingsFor } = require("../../../src/runtime/settings-form.js");
const { encode, rememberedAnswers } = require("../../../src/core/preferences.js");
const { normalizeSettings } = require("../../../src/core/settings.js");
const { defaultAnswers } = require("../../../src/core/form-rows.js");
const { readAnswers } = require("../../../src/core/answers.js");
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

test("an interactive run opens on the last one and remembers this one", () => {
    const memory = memoryHolding(encode(LAST_RUN));
    const settings = settingsFor(acceptingHost(), {}, 1, { openMemory: memory.open });

    assert.deepEqual(settings, LAST_RUN, "the last run's answers were offered back");
    assert.deepEqual(
        memory.state.wrote,
        [encode(LAST_RUN)],
        "and this run's were written once"
    );
});

test("a run with nothing to remember opens on the compiled defaults", () => {
    const memory = memoryHolding("");
    const settings = settingsFor(acceptingHost(), {}, 1, { openMemory: memory.open });

    assert.deepEqual(
        settings,
        normalizeSettings(readAnswers(defaultAnswers()).settings)
    );
    assert.equal(memory.state.wrote.length, 1);
});

test("a run with nowhere to remember still gets the form", () => {
    // This is the shape the bug took: nothing to remember became a null where
    // a set of answers belonged, the form could not read it, and a machine
    // that merely could not save its settings was quietly dropped into six
    // sequential dialogs instead. The host below has a working form, so if it
    // is not used the answers never reached it.
    const forgetful = { recall: () => "", remember: () => undefined };
    const host = acceptingHost();
    const bridge = { objc: { import: () => true, unwrap: (value) => value }, ns: {} };
    const shown = [];
    const present = (unused, spec) => {
        shown.push(spec);

        return { answers: rememberedAnswers(encode(LAST_RUN)) };
    };

    const settings = settingsFor(host, {}, 1, {
        openMemory: () => forgetful,
        bridge,
        present
    });

    assert.equal(shown.length, 1, "the form was presented");
    assert.deepEqual(settings, LAST_RUN);
    assert.deepEqual(host.listPrompts, [], "and nobody was asked six questions");
});

test("a cancelled run leaves the last run's settings alone", () => {
    // Nothing was confirmed, so there is nothing to remember -- and what is
    // already there belongs to the last run that did confirm.
    const memory = memoryHolding(encode(LAST_RUN));
    const host = acceptingHost();

    host.chooseFromList = () => false;

    assert.throws(() => settingsFor(host, {}, 1, { openMemory: memory.open }), /User cancelled/u);
    assert.deepEqual(memory.state.wrote, []);
});

test("a remembered colour that is no preset is offered back as a colour", () => {
    // The stepwise path has a list and a prompt rather than one control, so a
    // custom colour has to survive the trip through both of them.
    const memory = memoryHolding(encode(LAST_RUN));
    const host = acceptingHost();
    const asked = [];

    host.chooseFromList = (choices, options) => {
        asked.push(options.defaultItems[0]);

        return options.defaultItems;
    };

    settingsFor(host, {}, 1, { openMemory: memory.open });
    assert.ok(
        asked.includes("Custom colour..."),
        `the colour list opened on ${JSON.stringify(asked)}`
    );
});
