"use strict";

const {
    makeView,
    makeField,
    makeCombo,
    makePopup,
    makeAlert
} = require("./fake-appkit-objects.cjs");
const { makeWindow, makeBox } = require("./fake-panel-objects.cjs");

/*
 * A stand-in for the JXA ObjC bridge.
 *
 * It records what was built rather than drawing anything, which is what lets
 * the form composition be tested without AppKit. It cannot prove that AppKit
 * renders the result -- nothing headless can -- so what it establishes is
 * that the right widgets are created, configured and read back.
 *
 * Zero-argument ObjC methods are getters here, because that is how JXA
 * invokes them: `alert.runModal` runs the modal, it does not describe it.
 */

/*
 * The classes the widget layer reaches for, and nothing else: a fake that
 * grew past what is used would stop being evidence about the real code.
 */
function colourClass() {
    return {
        labelColor: { kind: "colour", name: "label" },
        separatorColor: { kind: "colour", name: "separator" },
        controlAccentColor: { kind: "colour", name: "controlAccent" },
        secondaryLabelColor: { kind: "colour", name: "secondaryLabel" },
        systemRedColor: {
            kind: "colour",
            name: "systemRed",
            colorWithAlphaComponent: (alpha) => ({
                kind: "colour",
                name: "systemRed",
                alpha
            })
        }
    };
}

function installClasses(ns, state, application) {
    Object.assign(ns, {
        NSMakeRect: (left, bottom, width, height) => ({ left, bottom, width, height }),
        NSMakeSize: (width, height) => ({ width, height }),
        NSSelectorFromString: (name) => `sel:${name}`,
        NSModalPanelRunLoopMode: "NSModalPanelRunLoopMode",
        NSView: { alloc: { initWithFrame: makeView } },
        NSTextField: { alloc: { initWithFrame: makeField } },
        NSPopUpButton: { alloc: { initWithFramePullsDown: makePopup } },
        NSComboBox: { alloc: { initWithFrame: makeCombo } },
        NSColor: colourClass(),
        NSFont: {
            systemFontOfSize: (size) => ({ kind: "font", size }),
            boldSystemFontOfSize: (size) => ({ kind: "font", size, bold: true })
        },
        NSPanel: { alloc: { initWithContentRectStyleMaskBackingDefer: makeWindow } },
        NSBox: { alloc: { initWithFrame: makeBox } },
        NSDate: {
            dateWithTimeIntervalSinceNow: (seconds) => ({ kind: "date", seconds })
        },
        NSRunLoop: {
            currentRunLoop: {
                runModeBeforeDate(mode, until) {
                    state.pumped.push({ mode, until });
                }
            }
        },
        NSAlert: { alloc: { get init() { return makeAlert(state); } } },
        NSApplication: { sharedApplication: application },
        NSObject: {
            cancelPreviousPerformRequestsWithTargetSelectorObject(
                target,
                selector,
                argument
            ) {
                state.disarmed.push({ target, selector, argument });
            }
        }
    });
}

function createFakeObjC(settings = {}) {
    const state = {
        responses: [...(settings.responses ?? [])],
        alerts: [],
        watchdogs: [],
        disarmed: [],
        pumped: [],
        policies: [],
        duringModal: settings.duringModal ?? (() => undefined),
        // NSApplicationActivationPolicyAccessory unless a test says otherwise;
        // 2 is prohibited, which cannot put a window on screen.
        policy: settings.policy ?? 1
    };

    const application = {
        performSelectorWithObjectAfterDelayInModes(selector, argument, delay, modes) {
            state.watchdogs.push({ selector, argument, delay, modes });
        },
        setActivationPolicy(policy) {
            state.policies.push(policy);
            state.policy = policy;
        }
    };

    Object.defineProperty(application, "activationPolicy", {
        get: () => state.policy
    });

    const ns = (value) => ({ boxed: value });

    installClasses(ns, state, application);

    return { ns, objc: { unwrap: (value) => value, import: () => true }, state };
}

module.exports = { createFakeObjC };
