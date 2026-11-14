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
function colorClass() {
    return {
        labelColor: { kind: "color", name: "label" },
        separatorColor: { kind: "color", name: "separator" },
        controlAccentColor: { kind: "color", name: "controlAccent" },
        secondaryLabelColor: { kind: "color", name: "secondaryLabel" },
        systemRedColor: {
            kind: "color",
            name: "systemRed",
            colorWithAlphaComponent: (alpha) => ({
                kind: "color",
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
        NSMakeRange: (location, length) => ({ location, length }),
        NSSelectorFromString: (name) => `sel:${name}`,
        NSModalPanelRunLoopMode: "NSModalPanelRunLoopMode",
        NSButton: { alloc: { initWithFrame: (rect) => ({...makeView(rect), state: 0, setButtonType(type) {this.buttonType=type;}}) } },
        NSView: { alloc: { initWithFrame: makeView } },
        NSScrollView: { alloc: { initWithFrame: (rect) => {
            const scroll = { ...makeView(rect), contentSize: { width: rect.width - 15, height: rect.height }, reflected: 0 };
            scroll.contentView = { scrollToPoint(point) { scroll.scrolledTo = point; } };
            scroll.reflectScrolledClipView = () => { scroll.reflected += 1; };
            return scroll;
        } } },
        NSMakePoint: (left, top) => ({ left, top }),
        NSTextView: { alloc: { initWithFrame(rect) {
            const field = { ...makeField(rect), textContainer: {} };
            field.scrollRangeToVisible = (range) => { field.scrolledRange = range; };
            return field;
        } } },
        NSTextField: { alloc: { initWithFrame: makeField } },
        NSPopUpButton: { alloc: { initWithFramePullsDown: makePopup } },
        NSComboBox: { alloc: { initWithFrame: makeCombo } },
        NSColor: colorClass(),
        NSFont: {
            systemFontSize: 13,
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
        nextEventMatchingMaskUntilDateInModeDequeue: () => null,
        sendEvent: () => undefined,
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

    function boxed(value) {
        return { boxed: value, objectForKey: (key) => {
            const found = value[key?.boxed ?? key];
            return found && typeof found === "object" && !found.kind ? boxed(found) : found;
        } };
    }
    const classes = new Map();
    const ns = boxed;
    ns.NSClassFromString = (name) => classes.get(name) ?? {isNil:()=>true};
    const registerSubclass = (definition) => {
        classes.set(definition.name, {isNil:()=>false,alloc:{get init(){return {modeChanged:definition.methods["modeChanged:"].implementation};}}});
    };

    installClasses(ns, state, application);

    return { ns, objc: { unwrap: (value) => value, import: () => true, registerSubclass }, state };
}

module.exports = { createFakeObjC };
