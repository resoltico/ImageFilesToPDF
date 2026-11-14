"use strict";
const { formSpec, defaultAnswers } = require("../../src/host/quick-action/settings-model.js");
const { readAnswers } = require("../../src/host/quick-action/settings-model.js");
const { buildForm } = require("../../src/host/quick-action/appkit.js");
const { WIDGETS } = require("../../src/host/quick-action/appkit.js");
const { appkitBridge } = require("../../src/host/quick-action/objc-bridge.js");
const { build: buildProgressPanel, allowWindows } = require("../../src/host/quick-action/panel.js");
const { detailsAlert, layoutDetails, runDetailsModal } = require("../../src/host/quick-action/details-dialog.js");
const SMALLEST_VISIBLE_HEIGHT = 744;
const PNG_TYPE = 4;

function requireNative(condition, message) {
    if (!condition) { throw new Error(message); }
}

function measureControl(control, row) {
    requireNative(ObjC.unwrap(control.accessibilityLabel) === row.label, `${row.key}: missing accessible name`);
    requireNative(ObjC.unwrap(control.accessibilityHelp).length > 0, `${row.key}: missing accessible help`);
    if (row.kind === "choice") {
        for (const option of row.options) {
            control.selectItemWithTitle(option.label);
            const needed = Number(control.cell.cellSize.width);
            requireNative(needed <= control.frame.size.width, `${option.label}: needs ${needed}, has ${control.frame.size.width}`);
        }
        control.selectItemAtIndex(row.options.findIndex((option) => option.value === row.value));
    }
}

function measuredControls(built, spec) {
    for (const row of spec.rows) { measureControl(built.controls[row.key], row); }
    const children = built.view.subviews;
    for (let index = 0; index < Number(children.count); index += 1) {
        const child = children.objectAtIndex(index);
        if (child.isKindOfClass($.NSTextField) && !child.editable) {
            requireNative(child.cell.cellSize.width <= child.frame.size.width, `Clipped label or hint: ${ObjC.unwrap(child.stringValue)}`);
        }
    }
}

function nativeForm(scenario) {
    const spec = formSpec(scenario.answers, scenario.problems, scenario.context);
    const built = buildForm({ objc: ObjC, ns: $ }, spec, WIDGETS);
    const alert = WIDGETS.makeAlert($, spec);
    alert.accessoryView = built.view;
    measuredControls(built, spec);
    for (const mode of ["separate", "combined"]) {
        built.controls.mode.selectItemAtIndex(mode === "combined" ? 0 : 1);
        requireNative($.NSApplication.sharedApplication.sendActionToFrom(built.controls.mode.action, built.controls.mode.target, built.controls.mode), "Mode action was not handled");
        requireNative(ObjC.unwrap(built.details.documentView.string) === spec.summaryDetails[mode], "Mode summary is stale");
    }
    built.controls.mode.selectItemAtIndex(scenario.answers.mode === "combined" ? 0 : 1);
    $.NSApplication.sharedApplication.sendActionToFrom(built.controls.mode.action, built.controls.mode.target, built.controls.mode);
    return { alert, details: built.details, controls: built.controls, rows: spec.rows };
}

function checkDetailWidths(view) {
    if (view.isKindOfClass($.NSScrollView)) {
        // Fixed scrollers appear during applet modal layout and reduce the clip width.
        view.scrollerStyle = 0;
        // eslint-disable-next-line no-unused-expressions
        view.tile;
        const document = view.documentView;
        requireNative(Math.abs(document.frame.size.width - view.contentSize.width) < 1, "Details do not track the clip width; leading characters can be clipped.");
        requireNative(Number(document.visibleRect.origin.x) === 0, "Details are horizontally scrolled.");
        requireNative(Number(document.visibleRect.origin.y) === 0, "Details do not start at the first line.");
        requireNative(Number(view.verticalScroller.doubleValue) === 0, "Details scroller does not start at zero.");
    }
    const children = view.subviews;
    for (let index = 0; index < Number(children.count); index += 1) { checkDetailWidths(children.objectAtIndex(index)); }
}

const MINIMUM_TINT_DIFFERENCE = 0.005;

function redExcess(control) {
    const bitmap = control.bitmapImageRepForCachingDisplayInRect(control.bounds);
    control.cacheDisplayInRectToBitmapImageRep(control.bounds, bitmap);
    const color = bitmap.colorAtXY(Math.floor(Number(bitmap.pixelsWide) * 0.75), Math.floor(Number(bitmap.pixelsHigh) * 0.5))
        .colorUsingColorSpace($.NSColorSpace.deviceRGBColorSpace);
    return Number(color.redComponent) - Number(color.blueComponent);
}

function checkInvalidTint(control, key) {
    const layers = control.layer.sublayers;
    const fill = Array.from({ length: Number(layers.count) }, (ignored, index) => layers.objectAtIndex(index))
        .find((layer) => String(ObjC.unwrap(layer.name)) === "InvalidSettingFill");
    requireNative(Boolean(fill), `${key}: missing invalid fill layer`);
    const marked = redExcess(control);
    // The same native control without only its error fill is the negative control.
    // eslint-disable-next-line no-unused-expressions -- native zero-argument method
    fill.removeFromSuperlayer;
    const plain = redExcess(control);
    control.layer.addSublayer(fill);
    requireNative(marked - plain > MINIMUM_TINT_DIFFERENCE, `${key}: invalid tint is hidden by the native control (${marked}, ${plain})`);
}

function writePreview(alert, path) {
    const content = alert.window.contentView;
    // Native zero-argument methods are getter accesses in JXA.
    // eslint-disable-next-line no-unused-expressions
    content.layoutSubtreeIfNeeded;
    checkDetailWidths(content);
    const bitmap = content.bitmapImageRepForCachingDisplayInRect(content.bounds);
    content.cacheDisplayInRectToBitmapImageRep(content.bounds, bitmap);
    const png = bitmap.representationUsingTypeProperties(PNG_TYPE, $.NSDictionary.dictionary);
    requireNative(png.writeToFileAtomically(path, true), `Could not write ${path}`);
}

function snapshot(folder, scenario, appearance) {
    const built = scenario.detail ? { alert: detailsAlert($, scenario) } : nativeForm(scenario);
    const { alert } = built;
    alert.window.appearance = $.NSAppearance.appearanceNamed(appearance);
    layoutDetails($, alert, [built.details ?? alert.accessoryView]);
    for (const row of built.rows ?? []) { if (row.invalid) { checkInvalidTint(built.controls[row.key], row.key); } }
    const height = Number(alert.window.frame.size.height);
    requireNative(height <= SMALLEST_VISIBLE_HEIGHT, `${scenario.name}: ${height} points exceeds ${SMALLEST_VISIBLE_HEIGHT}`);
    const path = `${folder}/${scenario.name}-${appearance}.png`;
    writePreview(alert, path);
    // eslint-disable-next-line no-unused-expressions
    alert.window.close;
    // Diagnostic output from this native gate, never product stdout.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ scenario: scenario.name, appearance, height, path }));
}

function scenariosFor(longPath) {
    const answers = defaultAnswers();
    const invalid = { ...answers, resolutionLimit: "1018", quality: "101", background: "purple" };
    const {problems} = readAnswers(invalid);
    const common = { answers, problems: [], context: { count: 12, folders: ["/Pictures/"] } };
    return [
        { ...common, name: "one-image", context: { count: 1, folders: ["/Pictures/"] } },
        { ...common, name: "combined" },
        { ...common, name: "all-invalid-controls", problems: Object.keys(answers).map((key) => ({ key, message: `Correct ${key}.` })) },
        { ...common, name: "separate", answers: { ...answers, mode: "separate", paperSize: "Letter" } },
        { ...common, name: "corrections", answers: invalid, problems },
        { ...common, name: "deep-path-errors", answers: invalid, problems, context: { count: 12, folders: [longPath] } },
        { ...common, name: "many-destinations", context: { count: 12, folders: Array.from({ length: 12 }, (ignored, index) => `/Volumes/Photos${index}/`) } },
        ...["setup", "confirmation", "rejection", "completion"].map((name) => ({ name, title: "Image Files to PDF", summary: "Review full details.",
            detail: Array.from({ length: 100 }, (ignored, index) => `${index}: ${longPath}`).join("\n"), buttons: ["Continue", "Cancel"] }))
    ];
}

function checkStopControl(appearance) {
    const view = buildProgressPanel($, ObjC);
    view.panel.appearance = $.NSAppearance.appearanceNamed(appearance);
    const accessible = $.NSAccessibilityUnignoredDescendant(view.stop);
    requireNative(String(ObjC.unwrap(accessible.accessibilityRole)) === "AXButton", "Stop is not an accessibility button.");
    view.stop.setButtonType(1);
    requireNative(String(ObjC.unwrap(accessible.accessibilityRole)) === "AXCheckBox", "The legacy toggle negative control did not expose a checkbox.");
    view.stop.setButtonType(7);
    requireNative($.NSApplication.sharedApplication.sendActionToFrom(view.stop.action, view.stop.target, view.stop), "Stop action was not handled.");
    requireNative(!view.stop.enabled && String(ObjC.unwrap(view.stop.title)) === "Stopping…", "Stop request feedback is missing.");
    requireNative(Number(view.stop.cell.cellSize.width) <= Number(view.stop.frame.size.width), "Stopping feedback is clipped.");
    // eslint-disable-next-line no-unused-expressions -- native zero-argument method
    view.panel.close;
}

const MODAL_SCROLL_DELAY = 0.1;
const SCROLL_TOLERANCE = 0.001;

function checkModalScroll(appearance, initialize) {
    const restore = allowWindows($);
    const alert = detailsAlert($, { title: "Native modal scroll check", summary: "Read full details.",
        detail: Array.from({ length: 40 }, (ignored, index) => `${index}: Generated native modal details.`).join("\n"), buttons: ["OK"] });
    alert.window.appearance = $.NSAppearance.appearanceNamed(appearance);
    const scroll = alert.accessoryView;
    const state = { phase: 0, desired: 0, initial: null, failure: null, callback: null };
    let timer = null;
    state.callback = ObjC.block(["void", ["id"]], () => {
        try {
            if (state.phase === 0) {
                state.initial = Number(scroll.verticalScroller.doubleValue);
                if (initialize) { requireNative(state.initial === 0, "Shown modal details did not start at zero."); }
                else { requireNative(state.initial >= 0 && state.initial <= 1, "The pre-modal-only control did not show a real scroller."); }
                state.phase = 1;
                const middle = (Number(scroll.documentView.frame.size.height) - Number(scroll.contentSize.height)) / 2;
                scroll.contentView.scrollToPoint($.NSMakePoint(0, middle));
                scroll.reflectScrolledClipView(scroll.contentView);
                state.desired = Number(scroll.verticalScroller.doubleValue);
                requireNative(state.desired > 0, "The user-scroll negative control did not move.");
            } else {
                requireNative(Math.abs(Number(scroll.verticalScroller.doubleValue) - state.desired) < SCROLL_TOLERANCE, "Initialization fought later user scrolling.");
                state.phase = 2;
                // eslint-disable-next-line no-unused-expressions -- native zero-argument method
                $.NSApplication.sharedApplication.abortModal;
            }
        } catch (error) {
            state.failure = { error };
            // eslint-disable-next-line no-unused-expressions -- native zero-argument method
            $.NSApplication.sharedApplication.abortModal;
        }
    });
    try {
        timer = $.NSTimer.timerWithTimeIntervalRepeatsBlock(MODAL_SCROLL_DELAY, true, state.callback);
        $.NSRunLoop.currentRunLoop.addTimerForMode(timer, $.NSModalPanelRunLoopMode);
        if (initialize) { runDetailsModal({ objc: ObjC, ns: $ }, alert, [scroll]); }
        else {
            // Retired pre-modal reset is a measured control, not a requirement
            // that future AppKit versions must preserve the old defect.
            layoutDetails($, alert, [scroll]);
            Number(alert.runModal);
        }
        if (state.failure) { throw state.failure.error; }
        requireNative(state.phase === 2, "The actual modal lifecycle was not exercised.");
        // eslint-disable-next-line no-console -- native gate evidence
        console.log(JSON.stringify({ modalInitialization: initialize ? "visible-update" : "pre-modal-only", appearance, initialScroller: state.initial, laterUserScrollRetained: true }));
    } finally {
        // eslint-disable-next-line no-unused-expressions -- native zero-argument methods
        if (timer) { timer.invalidate; }
        // eslint-disable-next-line no-unused-expressions -- native zero-argument method
        alert.window.close;
        state.callback = null;
        restore();
    }
}

function run(input) {
    requireNative(Boolean(appkitBridge(ObjC, $)), "Native UI frameworks are unavailable.");
    // eslint-disable-next-line no-unused-expressions
    $.NSApplication.sharedApplication;
    const scenarios = scenariosFor(String(input[1]));
    for (const appearance of ["NSAppearanceNameAqua", "NSAppearanceNameDarkAqua"]) {
        const name = ObjC.unwrap($[appearance]);
        checkStopControl(name);
        checkModalScroll(name, false);
        checkModalScroll(name, true);
        for (const scenario of scenarios) { snapshot(String(input[0]), scenario, name); }
    }
    return "macOS form integration passed";
}
module.exports = { run };
