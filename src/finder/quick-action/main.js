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
const { executableChoices } = require("../../core/setup.js");
const { chooseExecutable, executableMemory } = require("./executable-choice.js");

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

function progressObserver(open = openPanel) {
    let panel = null;
    let available = true;
    const state = { done: 0, total: null, phase: "", nextPhase: "", detail: "", stopped: false, diagnostics: [] };
    function record(error) {
        const translated = hostError(error);
        if (isUserCanceled(translated)) { state.stopped = true; }
        else { available = false; state.diagnostics.push({ code: "observer-fault", message: String(translated), stack: error?.stack ?? "" }); }
    }
    try { panel = open(); } catch (error) { record(error); }
    function notify(effect) {
        if (!panel || !available) { return; }
        try { effect(panel); } catch (error) { record(error); }
    }
    return {
        diagnostics: state.diagnostics,
        progress(event) {
            if (event.type === "phase") { state.nextPhase = event.phase; }
            else if (event.type === "progress") {
                state.phase = state.nextPhase;
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

function runReceipt(run, chosen) {
    try { return run(chosen); }
    catch (caught) {
        const error = hostError(caught);
        if (isUserCanceled(error)) { throw error; }
        return failedRun(error, caught?.outcome);
    }
}

function withExecutableChoices(ports, app, progress, run) {
    const memory = ports.executableMemory?.();
    const chosen = { ...memory?.recalled };
    for (;;) {
        const receipt = runReceipt(run, chosen);
        const choices = ports.chooseExecutable ? executableChoices(receipt) : [];
        if (choices.length === 0) {
            receipt.diagnostics.push(...(memory?.diagnostics ?? []));
            return receipt;
        }
        progress.pause();
        let updated = false;
        for (const name of choices) {
            const path = ports.chooseExecutable(app, name, receipt);
            if (path !== undefined) {
                chosen[name] = path;
                memory?.remember(name, path);
                updated = true;
            }
        }
        if (!updated) { return null; }
    }
}

function clientOutcome(ports, app, input, progress) {
    try {
        const items = ports.collect(app, input).inputItems.map(rawItem);
        let lastContext = null;
        const hooks = {
            progress: progress.progress, stopped: progress.stopped,
            review(context) { progress.pause(); return ports.review(app, context); },
            settings(context, problems) {
                progress.pause();
                lastContext = context ?? lastContext;
                return ports.settings(app, { ...lastContext, diagnostics: progress.diagnostics }, { problems });
            }
        };
        return withExecutableChoices(ports, app, progress, (chosen) => ports.runEngine(items, hooks, chosen));
    } catch (caught) {
        const error = hostError(caught);
        return isUserCanceled(error) ? null : failedRun(error, caught?.outcome);
    } finally { progress.close(); }
}

const finder = {
    application,
    openProgress: progressObserver,
    collect: collectInvocation,
    review: reviewSelection,
    settings: chooseSettings,
    noImages: reportNoImages,
    result: reportResult,
    chooseExecutable, executableMemory,
    runEngine: (items, hooks, chosen) => engineSession(engineBundle, items, hooks, { chosen })
};

function runQuickAction(input, ports = finder) {
    const app = ports.application();
    const progress = ports.openProgress();
    const report = clientOutcome(ports, app, input, progress);
    if (!report) { return undefined; }
    if (report.state === "canceled" && report.documents.length === 0) { return undefined; }
    if (report.issues.some((issue) => issue.code === "no-images")) { return ports.noImages(app, report.rejected); }
    report.diagnostics.push(...progress.diagnostics);
    try { return ports.result(app, report); }
    catch (caught) {
        const error = hostError(caught);
        return isUserCanceled(error) ? undefined : ports.result(app, failedRun(error, report));
    }
}

module.exports = { runQuickAction };
