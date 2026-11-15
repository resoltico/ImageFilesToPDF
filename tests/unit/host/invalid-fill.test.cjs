"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { markInvalid } = require("../../../src/host/quick-action/invalid-fill.js");
const { createFakeObjC } = require("../ports/fake-objc.cjs");

function fixture() {
    const bridge = createFakeObjC();
    const parent = bridge.ns.NSView.alloc.initWithFrame({ left: 0, bottom: 0, width: 400, height: 200 });
    const control = bridge.ns.NSTextField.alloc.initWithFrame({ left: 100, bottom: 30, width: 70, height: 24 });
    control.autoresizingMask = 5; control.stringValue = "1018";
    parent.addSubview(control);
    return { ...bridge, parent, control };
}

test("native tint is an above-control sibling with preserved geometry and no input or accessibility target", () => {
    const { ns, objc, parent, control } = fixture();
    markInvalid(ns, control, objc);
    const [, fill] = parent.subviews;
    assert.equal(fill.identifier, "InvalidSettingFill"); assert.equal(fill.relativeTo, control); assert.equal(fill.order, ns.NSWindowAbove);
    assert.deepEqual(fill.frame, control.frame); assert.equal(fill.autoresizingMask, 5);
    assert.equal(fill.fillColor.name, "systemRed"); assert.equal(fill.fillColor.alpha, 0.18); assert.equal(fill.cornerRadius, 4);
    assert.equal(fill.borderWidth, 0); assert.equal(fill.titlePosition, ns.NSNoTitle); assert.equal(fill.boxType, ns.NSBoxCustom);
    assert.equal(fill.hitTest({ left: 135, top: 42 }).isNil(), true); assert.equal(fill.isOpaque, false); assert.equal(fill.acceptsFirstResponder, false);
    assert.equal(fill.accessibilityElement, false); assert.equal(control.stringValue, "1018");
    assert.deepEqual(control.layer.sublayers, []); assert.equal(control.wantsLayer, undefined, "the control's AppKit backing is not modified");
});

test("one native class serves all fields and a registration fault remains a fault", () => {
    const sample = fixture(); const register = sample.objc.registerSubclass;
    let registrations = 0;
    sample.objc.registerSubclass = (definition) => { registrations += 1; assert.equal(definition.superclass, "NSBox"); register(definition); };
    markInvalid(sample.ns, sample.control, sample.objc); markInvalid(sample.ns, sample.control, sample.objc);
    assert.equal(registrations, 1);
    const broken = fixture(), failure = new TypeError("Invalid fill class failed.");
    broken.objc.registerSubclass = () => { throw failure; };
    assert.throws(() => markInvalid(broken.ns, broken.control, broken.objc), (error) => error === failure);
    assert.deepEqual(broken.parent.subviews, [broken.control]);
});
