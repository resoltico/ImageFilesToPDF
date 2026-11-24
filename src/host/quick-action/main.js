"use strict";
const { failedRun } = require("../../core/outcomes.js");
const { isUserCanceled } = require("../../core/errors.js");
const { hostError } = require("../cancellation.js");
const { collectInvocation } = require("./input.js");
const { reviewSelection } = require("./settings-review.js");
const { chooseSettings } = require("./settings-form.js");
const { reportNoImages, reportResult } = require("./reporting.js");
const { openPanel } = require("./panel.js");
const { engineSession } = require("./engine-client.js");
const { engineBundle } = require("./engine-source.js");

function rawItem(item) {
    if (typeof item === "string") { return item; }
    try { if (typeof item?.url === "function") { return String(item.url()); } }
    catch { return String(item); }
    return String(item);
}

function application() {
    const app = Application.currentApplication();
    app.includeStandardAdditions = true;
    return app;
}

function progressObserver() {
    let panel = null;
    let available = true;
    const state = { done: 0, total: null, phase: "", detail: "", stopped: false, diagnostics: [] };
    function record(error) {
        const translated = hostError(error);
        if (isUserCanceled(translated)) { state.stopped = true; }
        else { available = false; state.diagnostics.push({ code: "observer-fault", message: String(translated), stack: error?.stack ?? "" }); }
    }
    try { panel = openPanel(); } catch (error) { record(error); }
    function notify(effect) {
        if (!panel || !available) { return; }
        try { effect(panel); } catch (error) { record(error); }
    }
    return {
        diagnostics: state.diagnostics,
        progress(event) {
            if (event.type === "phase") { state.phase = event.phase; }
            else if (event.type === "progress") {
                state.done = event.done;
                state.detail = event.current ?? "";
                if (state.total !== event.total) { state.total = event.total; notify((sink) => sink.start(state.total)); }
            }
        },
        stopped() {
            if (!state.stopped && state.phase) { notify((sink) => sink.report(state.done, state.phase, state.detail)); }
            return state.stopped;
        },
        pause() { notify((sink) => sink.pause()); },
        close() {
            try { panel?.close(); } catch (error) { record(error); }
        }
    };
}

function clientOutcome(app, input, progress) {
    try {
        const items = collectInvocation(app, input).inputItems.map(rawItem);
        let lastContext = null;
        return engineSession(engineBundle, items, {
            progress: progress.progress, stopped: progress.stopped,
            review(context) { progress.pause(); return reviewSelection(app, context); },
            settings(context, problems) {
                progress.pause();
                lastContext = context ?? lastContext;
                return chooseSettings(app, { ...lastContext, diagnostics: progress.diagnostics }, { problems });
            }
        });
    } catch (caught) {
        const error = hostError(caught);
        return isUserCanceled(error) ? null : failedRun(error, caught?.outcome);
    } finally { progress.close(); }
}

function runQuickAction(input) {
    const app = application();
    const progress = progressObserver();
    const report = clientOutcome(app, input, progress);
    if (!report) { return undefined; }
    if (report.state === "canceled" && report.documents.length === 0) { return undefined; }
    if (report.issues.some((issue) => issue.code === "no-images")) { return reportNoImages(app, report.rejected); }
    report.diagnostics.push(...progress.diagnostics);
    try { return reportResult(app, report); }
    catch (caught) {
        const error = hostError(caught);
        return isUserCanceled(error) ? undefined : reportResult(app, failedRun(error, report));
    }
}

module.exports = { runQuickAction };
