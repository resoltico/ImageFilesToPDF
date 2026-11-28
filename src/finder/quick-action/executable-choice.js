"use strict";

const { message } = require("../../core/messages.js");
const { APP_NAME } = require("../../core/product.js");
const { absoluteMacPath, FINDER_EXECUTABLES } = require("../../core/executable-search.js");
const { reportText } = require("../../core/run-report.js");
const { showDetails } = require("./details-dialog.js");
const { createMemory } = require("./preferences.js");
const { hostError } = require("../cancellation.js");
const { isUserCanceled } = require("../../core/errors.js");

const preferenceKey = (name) => `executable.${name}`;

function executableMemory(domain) {
    const memory = createMemory(globalThis.ObjC, globalThis.$, domain);
    return {
        recalled: Object.fromEntries(FINDER_EXECUTABLES.map((name) => [name, memory.recall(preferenceKey(name))]).filter(([, value]) => value !== "")),
        remember(name, path) { memory.remember(path, preferenceKey(name)); },
        diagnostics: memory.diagnostics
    };
}

function chooseExecutable(app, name, receipt) {
    const prompt = message("chooseExecutableSetup", { name });
    const detail = reportText(receipt, false);
    const response = showDetails(app, { title: APP_NAME, summary: `${message("setupFailed")} ${prompt}`,
        detail, fallbackDetail: `${reportText(receipt)}\n\n${prompt}`,
        buttons: ["Skip", message("chooseExecutableButton")] });
    if (response !== 1) { return undefined; }
    try {
        const path = String(app.chooseFile({ withPrompt: message("chooseExecutablePrompt", { name }), invisibles: true }));
        return absoluteMacPath(path) ? path : undefined;
    } catch (caught) {
        const error = hostError(caught);
        if (!isUserCanceled(error)) { throw error; }
        return undefined;
    }
}

module.exports = { chooseExecutable, executableMemory };
