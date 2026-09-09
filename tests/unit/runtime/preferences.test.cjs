"use strict";

/*
 * Where the record is kept.
 *
 * A fake proves which defaults object is asked for and what is done with it.
 * That a named suite is writable inside the Shortcuts helper is not something
 * anything headless can establish -- QA.md says how that is checked.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createMemory } = require("../../../src/runtime/preferences.js");
const { DOMAIN, KEY } = require("../../../src/core/preferences.js");

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

test("the record goes in a suite of this action's own", () => {
    const { objc, ns, state } = bridge();
    const memory = createMemory(objc, ns);

    memory.remember("{}");
    assert.equal(state.imported, "Foundation", "NSUserDefaults comes from Foundation");
    assert.deepEqual(state.suites, [DOMAIN]);
    assert.deepEqual(state.wrote, [{ value: "{}", key: KEY }]);
    assert.ok(
        !state.reachedForStandard,
        "the standard defaults belong to whatever is running the script"
    );
});

test("what was remembered comes back", () => {
    const { objc, ns } = bridge({ stored: '{"schema":1}' });

    assert.equal(createMemory(objc, ns).recall(), '{"schema":1}');
});

test("nothing remembered and nothing readable are one answer", () => {
    assert.equal(createMemory(...Object.values(bridge()).slice(0, 2)).recall(), "");
    assert.equal(
        createMemory(...Object.values(bridge({ readThrows: true })).slice(0, 2)).recall(),
        ""
    );
});

test("a suite that cannot be made is not replaced by somebody else's", () => {
    // There is no second-best place to put this. A run that cannot remember
    // opens on the compiled defaults and converts the images.
    const withoutSuite = bridge({ noSuite: true });

    assert.equal(createMemory(withoutSuite.objc, withoutSuite.ns), null);
    assert.ok(!withoutSuite.state.reachedForStandard);

    const withoutFoundation = bridge({ importThrows: true });

    assert.equal(createMemory(withoutFoundation.objc, withoutFoundation.ns), null);
    assert.equal(createMemory(null, {}), null);
    assert.equal(createMemory({ import: () => true }, null), null);
});

test("a write that will not stick does not fail the run", () => {
    // The conversion is what the person asked for. A preference that would
    // not save is not worth ending it over, or mentioning afterwards.
    const { objc, ns } = bridge({ writeThrows: true });

    assert.doesNotThrow(() => createMemory(objc, ns).remember("{}"));
});
