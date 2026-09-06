"use strict";

const {
    makeView,
    makeField,
    makePopup,
    makeImage,
    makeAlert
} = require("./fake-appkit-objects.cjs");

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
function colourClass(state) {
    return {
        secondaryLabelColor: { kind: "colour", name: "secondaryLabel" },
        systemRedColor: {
            kind: "colour",
            name: "systemRed",
            colorWithAlphaComponent: (alpha) => ({
                kind: "colour",
                name: "systemRed",
                alpha
            })
        },
        colorWithSRGBRedGreenBlueAlpha(red, green, blue, alpha) {
            const colour = { red, green, blue, alpha };

            return Object.defineProperty({}, "set", {
                get: () => {
                    // Order matters: the fill is set, then the border.
                    state.colours.push(colour);

                    return true;
                }
            });
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
        NSImage: {
            alloc: {
                initWithSize: (size) => {
                    state.currentImage = makeImage(size);

                    return state.currentImage;
                }
            }
        },
        NSColor: colourClass(state),
        NSFont: { systemFontOfSize: (size) => ({ kind: "font", size }) },
        NSBezierPath: {
            fillRect: (rect) => state.fills.push(rect),
            strokeRect: (rect) => state.strokes.push(rect)
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
        currentImage: null,
        disarmed: [],
        fills: [],
        strokes: [],
        colours: []
    };

    const application = {
        performSelectorWithObjectAfterDelayInModes(selector, argument, delay, modes) {
            state.watchdogs.push({ selector, argument, delay, modes });
        }
    };

    const ns = (value) => ({ boxed: value });

    installClasses(ns, state, application);

    return { ns, objc: { unwrap: (value) => value, import: () => true }, state };
}

module.exports = { createFakeObjC };
