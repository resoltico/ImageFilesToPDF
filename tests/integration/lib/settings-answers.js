"use strict";

const { chooseSettings } = require("../../../src/finder/quick-action/settings-form.js");

const FORM_ANSWERS = { mode: "separate", paperSize: "Letter", orientation: "Landscape",
    resolutionLimit: "360", quality: "74", background: "8e79e0" };
const CREATE_RESPONSE = 1000;
const TIMER_DELAY = 0.05;

function scriptedDialogs(scenario, observation) {
    const answers = scenario === "corrected" ? ["1018", "360", "74", "8e79e0"] : ["360", "74", "8e79e0"];
    return {
        chooseFromList(choices) {
            observation.lists += 1;
            return scenario === "cancel" ? false : [choices.at(-1)];
        },
        displayDialog(text, options) {
            if (!Object.hasOwn(options, "defaultAnswer")) {
                if (!options.buttons.includes("Create")) { throw new Error("Expected final Create confirmation."); }
                observation.confirmed += 1;
                return { buttonReturned: "Create" };
            }
            if (answers.length === 0) { throw new Error("Unexpected text prompt."); }
            observation.prompts.push({ text, opening: options.defaultAnswer });
            return { textReturned: answers.shift() };
        }
    };
}

function runWithConfirmation(bridge, observation, collect) {
    const { ns, objc } = bridge;
    const application = ns.NSApplication.sharedApplication;
    const callback = objc.block(["void", ["id"]], () => {
        const window = application.modalWindow;
        if (window && !window.isNil() && window.visible) {
            observation.confirmed += 1;
            application.stopModalWithCode(CREATE_RESPONSE);
        }
    });
    const timer = ns.NSTimer.timerWithTimeIntervalRepeatsBlock(TIMER_DELAY, true, callback);
    ns.NSRunLoop.currentRunLoop.addTimerForMode(timer, ns.NSModalPanelRunLoopMode);
    try { return collect(); }
    finally {
        // eslint-disable-next-line no-unused-expressions -- Native zero-argument selector.
        timer.invalidate;
    }
}

function answerSettings(scenario, context, observation) {
    ObjC.import("AppKit");
    const bridge = { objc: ObjC, ns: $ };
    const app = scriptedDialogs(scenario, observation);
    const collect = () => chooseSettings(app, context, {
        bridge,
        present() {
            observation.forms += 1;
            return scenario === "form" ? { answers: FORM_ANSWERS } : null;
        },
        openMemory: () => ({
            recall: () => "",
            remember(text) { observation.remembered = JSON.parse(text); },
            diagnostics: []
        })
    });
    return runWithConfirmation(bridge, observation, collect);
}

module.exports = { answerSettings };
