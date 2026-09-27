"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectSettings } = require("../../../src/runtime/settings-form.js");
const { defaultAnswers } = require("../../../src/core/form.js");
const { createFakeApp } = require("./fake-app.cjs");

const BRIDGE = { objc: {}, ns: {} };

function retryingPresenter(offered, throws) {
    return (bridge, spec) => {
        offered.push(spec);
        if (offered.length === 1) {
            return { answers: {
                ...defaultAnswers(), paperSize: "US Letter", orientation: "Landscape",
                mode: "Separate PDFs — one page per image", dpi: "bad", background: "#000000"
            } };
        }
        if (throws) {
            throw new Error("native window unavailable");
        }

        return null;
    };
}

function fallbackAfterRetry(throws) {
    const app = createFakeApp();
    const offered = [];

    app.chooseFromList = (choices, options) => {
        app.listPrompts.push({ choices, options });

        return options.defaultItems;
    };
    app.nextAnswer = "92";
    const settings = collectSettings(app, {
        context: { count: 2, folders: ["/Photos/"] }
    }, BRIDGE, retryingPresenter(offered, throws));

    return { app, offered, settings };
}

test("fallback keeps submitted corrections and selection context after a native retry fails", () => {
    for (const throws of [false, true]) {
        const { app, offered, settings } = fallbackAfterRetry(throws);

        assert.deepEqual(settings, {
            paperSize: "Letter", orientation: "Landscape", mode: "separate",
            background: "#000000", dpi: 92, quality: 92
        });
        assert.match(offered[1].detail, /You have selected 2 images/u);
        assert.match(app.listPrompts[0].options.withPrompt, /Save to: \/Photos\//u);
        assert.equal(app.dialogs[0].options.defaultAnswer, "bad");
        assert.match(app.dialogs.at(-1).message, /^Create 2 single-page PDFs/u);
    }
});

test("a cancellation thrown by the native host never starts fallback", () => {
    const app = createFakeApp();
    const cancelled = Object.assign(new Error("User cancelled"), { errorNumber: -128 });

    assert.throws(() => collectSettings(app, {}, BRIDGE, () => { throw cancelled; }),
        /User cancelled/u);
    assert.deepEqual(app.listPrompts, []);
    assert.deepEqual(app.dialogs, []);
});
