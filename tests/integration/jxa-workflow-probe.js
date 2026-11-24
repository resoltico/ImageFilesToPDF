"use strict";
const { execute, application } = require("../support/macos-conversion/host/main.js");
const { createProgress } = require("../../src/application/progress.js");
const { failedRun, noImagesOutcome } = require("../../src/core/outcomes.js");
const { normalizeSettings } = require("../../src/core/settings.js");
const { hostError } = require("../../src/host/cancellation.js");

// Integration-only entry to the production JXA adapter for mounted-volume tests.
function run(input) {
    const [settingsFile, ...sources] = input;
    ObjC.import("Foundation");
    const json = String(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError($(settingsFile), $.NSUTF8StringEncoding, $())));
    const { timestamp, ...values } = JSON.parse(json);
    const settings = normalizeSettings(values);
    const progress = createProgress([]);
    try {
        return JSON.stringify(execute(application(), sources, { interaction: {
            progress, collect: (items) => ({ inputItems: items, timestamp }), settings: () => settings,
            noImages: noImagesOutcome, present: (result) => result
        } }));
    } catch (error) { return JSON.stringify(failedRun(hostError(error), error.outcome)); }
    finally { progress.close(); }
}

module.exports = { run };
