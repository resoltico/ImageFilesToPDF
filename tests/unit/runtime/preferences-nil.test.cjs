"use strict";

/*
 * What the bridge hands back, and whether there is anything there.
 *
 * An Objective-C nil arrives as a JavaScript object, and a truthy one, so
 * asking whether it is there is answered yes and the first message sent to it
 * fails. Every way of ending up with nothing has to reach the same place: a
 * run that cannot remember converts the images anyway.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createMemory } = require("../../../src/runtime/preferences.js");
const { KEY } = require("../../../src/core/preferences.js");

function suiteFor(state, settings) {
    return {
        stringForKey(key) {
            state.readKey = key.boxed;

            if (settings.readThrows) {
                throw new Error("denied");
            }

            return state.stored;
        },
        setObjectForKey(value, key) {
            if (settings.writeThrows) {
                throw new Error("denied");
            }

            state.wrote.push({ value: value.boxed, key: key.boxed });
        }
    };
}

function bridge(settings = {}) {
    const state = { suites: [], stored: settings.stored ?? null, wrote: [] };
    const suite = suiteFor(state, settings);
    const ns = (value) => ({ boxed: value });

    ns.NSUserDefaults = {
        alloc: {
            initWithSuiteName(name) {
                state.suites.push(name.boxed);

                if (settings.suiteThrows) {
                    throw new Error("no such domain");
                }

                if (settings.nilSuite) {
                    return { isNil: () => true };
                }

                if (settings.wrappedSuite) {
                    return { ...suite, isNil: () => false };
                }

                return settings.noSuite ? null : suite;
            }
        },
        get standardUserDefaults() {
            state.reachedForStandard = true;

            return suite;
        }
    };

    const objc = {
        import: (framework) => {
            state.imported = framework;

            if (settings.importThrows) {
                throw new Error("no Foundation");
            }

            return true;
        },
        unwrap: (value) => value
    };

    return { objc, ns, state };
}

test("a wrapped object that is not nil is one to use", () => {
    // The bridge answers the question either way, and only one of the two
    // answers means there is nothing there.
    const { objc, ns, state } = bridge({ wrappedSuite: true });
    const memory = createMemory(objc, ns);

    assert.ok(memory, "an object that says it is not nil is an object");
    memory.remember("{}");
    assert.deepEqual(state.wrote, [{ value: "{}", key: KEY }]);
});

/*
 * Every way of failing to reach the defaults comes back as a memory that
 * recalls nothing and keeps nothing -- never as nothing, which a caller has
 * to remember to ask about at every place it uses it. Forgetting once put a
 * null where answers belonged, and a machine that merely could not save its
 * settings was answering six questions one at a time instead.
 */
function forgetful(memory) {
    assert.ok(memory, "there is always something to ask");
    assert.equal(memory.recall(), "", "which remembers nothing");
    assert.doesNotThrow(() => memory.remember("{}"), "and keeps nothing");
}

test("a wrapped nil is not an object to send messages to", () => {
    // An Objective-C nil arrives as a JavaScript object, and a truthy one:
    // asking whether it is there is answered yes, and the first message sent
    // to it fails. It is asked whether it is nil instead.
    const { objc, ns, state } = bridge({ nilSuite: true });

    forgetful(createMemory(objc, ns));
    assert.deepEqual(state.wrote, [], "nothing was written anywhere");
    assert.ok(!state.reachedForStandard);
});

test("a suite that raises does not take the conversion with it", () => {
    const { objc, ns } = bridge({ suiteThrows: true });

    forgetful(createMemory(objc, ns));
});

test("a suite that cannot be made is not replaced by somebody else's", () => {
    // There is no second-best place to put this. A run that cannot remember
    // opens on the compiled defaults and converts the images.
    const withoutSuite = bridge({ noSuite: true });

    forgetful(createMemory(withoutSuite.objc, withoutSuite.ns));
    assert.ok(!withoutSuite.state.reachedForStandard);

    const withoutFoundation = bridge({ importThrows: true });

    forgetful(createMemory(withoutFoundation.objc, withoutFoundation.ns));
    forgetful(createMemory(null, {}));
    forgetful(createMemory({ import: () => true }, null));
});

test("a write that will not stick does not fail the run", () => {
    // The conversion is what the person asked for. A preference that would
    // not save is not worth ending it over, or mentioning afterwards.
    const { objc, ns } = bridge({ writeThrows: true });

    assert.doesNotThrow(() => createMemory(objc, ns).remember("{}"));
});
