"use strict";

const { normalizeSettings } = require("../core/settings.js");
const { answersFromSettings } = require("./settings-model.js");

const DOMAIN = "com.resoltico.ImageFilesToPDF";
const KEY = "lastSettings.v1";

function encode(settings) {
    return JSON.stringify(settings);
}

function rememberedAnswers(text) {
    try {
        return answersFromSettings(normalizeSettings(JSON.parse(String(text))));
    } catch {
        return undefined;
    }
}

function present(value) {
    if (!value) {
        return false;
    }

    return typeof value.isNil !== "function" || !value.isNil();
}

function memoryOn(objc, ns, suite) {
    const diagnostics = [];
    return {
        state: "available", diagnostics,
        // Nothing there and nothing readable are the same answer -- and on a
        // first run there is nothing there, which comes back as a wrapped nil
        // rather than as a missing value.
        recall() {
            try {
                const held = suite.stringForKey(ns(KEY));

                return present(held) ? String(objc.unwrap(held)) : "";
            } catch (error) {
                diagnostics.push({ code: "preferences-read", message: String(error) });
                return "";
            }
        },

        // Best effort, and deliberately silent: a preference that would not
        // stick is not a failure of the conversion, and the completion
        // dialog is about the documents.
        remember(text) {
            try {
                suite.setObjectForKey(ns(text), ns(KEY));
            } catch (error) {
                diagnostics.push({ code: "preferences-write", message: String(error) });
            }
        }
    };
}

const FORGETFUL = Object.freeze({
    recall() {
        return "";
    },
    remember() {
        return undefined;
    }
});

function createMemory(objc, ns) {
    if (!objc || !ns) {
        return { ...FORGETFUL, state: "unavailable", diagnostics: [] };
    }

    try {
        objc.import("Foundation");

        const suite = ns.NSUserDefaults.alloc.initWithSuiteName(ns(DOMAIN));

        return present(suite) ? memoryOn(objc, ns, suite) : { ...FORGETFUL, state: "unavailable", diagnostics: [] };
    } catch (error) {
        return { ...FORGETFUL, state: "unavailable", diagnostics: [{ code: "preferences-unavailable", message: String(error) }] };
    }
}

module.exports = { DOMAIN, KEY, encode, rememberedAnswers, createMemory };
