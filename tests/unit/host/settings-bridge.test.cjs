"use strict";

/*
 * Deciding whether there is an AppKit to talk to at all, which happens before
 * any form exists and is tested apart from what the form then does.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { appkitBridge } = require("../../../src/host/objc-bridge.js");

test("a bridge needs both halves of the ObjC namespace", () => {
    assert.equal(appkitBridge(null, {}), null);
    assert.equal(appkitBridge({ import: () => true }, null), null);
    assert.equal(appkitBridge(undefined, undefined), null);
});

test("a bridge whose AppKit will not load is no bridge", () => {
    const objc = {
        import() {
            throw new Error("nothing found to import");
        }
    };

    assert.equal(appkitBridge(objc, {}), null);
});

test("a working bridge carries both halves through", () => {
    const imported = [];
    const objc = { import: (name) => imported.push(name) };
    const ns = { marker: true };

    assert.deepEqual(appkitBridge(objc, ns), { objc, ns });
    assert.deepEqual(imported, ["AppKit"]);
});

for (const error of [new TypeError("bridge bug"),new TypeError("nothing found to import"),new ReferenceError("missing symbol"),new Error("unexpected native failure"),null]) {
    test(`unexpected import fault ${String(error)} preserves its identity`,()=>{
        assert.throws(()=>appkitBridge({import(){throw error;}},{}),caught=>caught===error);
    });
}
