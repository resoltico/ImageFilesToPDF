"use strict";

/*
 * Whether a run gets a panel at all.
 *
 * Every way this can fail -- no ObjC bridge, no AppKit, no window server, a
 * host that refuses one of the objects -- has to end as a run with no
 * progress rather than a run that fails. And it has to leave the process
 * exactly as it was found: the activation policy is the one thing here that
 * outlives the window.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { openPanel } = require("../../../src/runtime/panel.js");
const { createFakeObjC } = require("./fake-objc.cjs");

const POLICY_ACCESSORY = 1;
const POLICY_PROHIBITED = 2;

test("a bridge that cannot be had is no panel", () => {
    assert.equal(openPanel(null), null);
});

test("a host that refuses an object is no panel, and no policy left changed", () => {
    // Built before the policy is touched, so a process that cannot make a
    // window is left exactly as it was found.
    const { ns, state } = createFakeObjC({ policy: POLICY_PROHIBITED });

    ns.NSPanel = {
        alloc: {
            get initWithContentRectStyleMaskBackingDefer() {
                throw new Error("no window server here");
            }
        }
    };

    assert.equal(openPanel({ objc: {}, ns }), null);
    assert.deepEqual(state.policies, []);
});

test("a host that can be reached is a panel, and may show a window", () => {
    const { ns, state } = createFakeObjC({ policy: POLICY_PROHIBITED });
    const sink = openPanel({ objc: {}, ns }, () => 0);

    assert.deepEqual(
        Object.keys(sink).sort(),
        ["close", "pause", "report", "start"]
    );
    assert.deepEqual(
        state.policies,
        [POLICY_ACCESSORY],
        "raised only as far as it takes to order a window front"
    );

    sink.close();

    assert.equal(state.policies.at(-1), POLICY_PROHIBITED, "and put back");
});
