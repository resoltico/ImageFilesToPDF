"use strict";
const MINIMUM_TINT_DIFFERENCE = 0.005;
const PNG_TYPE = 4;
const NATIVE_ALPHA = 0.5;

function requireNative(condition, message) { if (!condition) { throw new Error(message); } }
function nil(value) { return !value || value.isNil(); }
function sameRect(left, right) {
    return left.origin.x === right.origin.x && left.origin.y === right.origin.y && left.size.width === right.size.width && left.size.height === right.size.height;
}
function tintView(control) {
    const siblings = control.superview.subviews;
    return Array.from({ length: Number(siblings.count) }, (ignored, index) => siblings.objectAtIndex(index))
        .find((view) => String(ObjC.unwrap(view.identifier)) === "InvalidSettingFill" && sameRect(view.frame, control.frame));
}
function sample(bitmap, column, row) {
    const color = bitmap.colorAtXY(column, row).colorUsingColorSpace($.NSColorSpace.deviceRGBColorSpace);
    return [Number(color.redComponent), Number(color.greenComponent), Number(color.blueComponent), Number(color.alphaComponent)];
}
function controlBitmap(control) {
    const parent = control.superview, rect = control.frame;
    const bitmap = parent.bitmapImageRepForCachingDisplayInRect(rect);
    parent.cacheDisplayInRectToBitmapImageRep(rect, bitmap);
    requireNative(Number(bitmap.pixelsWide) > 0 && Number(bitmap.pixelsHigh) > 0, "The control capture is empty.");
    return bitmap;
}
function facts(bitmap) {
    const height = Number(bitmap.pixelsHigh), width = Number(bitmap.pixelsWide);
    const pixels = [];
    for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) { pixels.push(sample(bitmap, column, row)); }
    }
    const point = sample(bitmap, Math.floor(width * 0.75), Math.floor(height * 0.5));
    return { point: point[0] - point[2], region: pixels.reduce((total, pixel) => total + pixel[0] - pixel[2], 0) / pixels.length, pixels };
}
function range(pixels) {
    let high = -Infinity, low = Infinity;
    for (const pixel of pixels) {
        const light = (pixel[0] + pixel[1] + pixel[2]) / 3;
        high = Math.max(high, light); low = Math.min(low, light);
    }
    return high - low;
}

function nativeContent(marked, plain, key) {
    const covered = plain.pixels.map((pixel, index) => ({ pixel, index })).filter(({ pixel }) => pixel[3] >= NATIVE_ALPHA);
    requireNative(covered.length > 0, `${key}: capture contains no native text/bezel coverage`);
    requireNative(covered.every(({ index }) => marked.pixels[index][3] >= NATIVE_ALPHA), `${key}: native content disappeared under the tint`);
    const after = covered.map(({ index }) => marked.pixels[index]), before = covered.map(({ pixel }) => pixel);
    if (range(before) > 0.05) { requireNative(range(after) >= range(before) * 0.5, `${key}: native text/bezel contrast disappeared`); }
    else {
        requireNative(before.every((pixel, index) => pixel.slice(0, 3).every((value, channel) => Math.abs(value - after[index][channel]) < 0.55)), `${key}: tint replaced native content`);
    }
}
function writeBitmap(bitmap, path) {
    requireNative(bitmap.representationUsingTypeProperties(PNG_TYPE, $.NSDictionary.dictionary).writeToFileAtomically(path, true), `Could not write ${path}`);
}
function capture(control, point) {
    const bitmap = controlBitmap(control);
    return { bitmap, stats: facts(bitmap), target: control.superview.hitTest(point) };
}
function withoutFill(control, fill, point) {
    const parent = control.superview;
    // eslint-disable-next-line no-unused-expressions -- native zero-argument method
    fill.removeFromSuperview;
    try { return capture(control, point); }
    finally { parent.addSubviewPositionedRelativeTo(fill, $.NSWindowAbove, control); }
}
function checkInvalidTint(control, key, path) {
    const fill = tintView(control);
    requireNative(Boolean(fill), `${key}: missing above-control invalid fill`);
    requireNative(!fill.opaque && !fill.acceptsFirstResponder && !fill.accessibilityElement, `${key}: tint changes opacity/focus/accessibility`);
    const parent = control.superview, rect = control.frame;
    const localPoint = $.NSMakePoint(rect.origin.x + rect.size.width * 0.75, rect.origin.y + rect.size.height * 0.5);
    requireNative(nil(fill.hitTest(localPoint)), `${key}: tint intercepts mouse input`);
    const point = parent.convertPointToView(localPoint, parent.superview);
    const marked = capture(control, point), plain = withoutFill(control, fill, point);
    writeBitmap(marked.bitmap, `${path}-${key}-marked.png`); writeBitmap(plain.bitmap, `${path}-${key}-plain.png`);
    requireNative(!nil(marked.target) && !nil(plain.target) && marked.target.isEqual(plain.target), `${key}: tint changes the underlying mouse target`);
    requireNative(plain.target.isEqual(control) || plain.target.isDescendantOf(control), `${key}: sample does not hit the real native control`);
    requireNative(marked.stats.pixels.length === plain.stats.pixels.length, `${key}: captures do not cover the same rectangle`);
    nativeContent(marked.stats, plain.stats, key);
    // eslint-disable-next-line no-console -- evidence from actual composed native controls
    console.log(JSON.stringify({ tint: key, marked: marked.stats.point, plain: plain.stats.point, markedRegion: marked.stats.region, plainRegion: plain.stats.region, frame: rect, nativeContentRetained: true, mouseTargetRetained: true }));
    requireNative(marked.stats.point - plain.stats.point > MINIMUM_TINT_DIFFERENCE, `${key}: invalid tint is hidden by the native control (${marked.stats.point}, ${plain.stats.point})`);
    requireNative(marked.stats.region - plain.stats.region > MINIMUM_TINT_DIFFERENCE, `${key}: invalid tint is not visible across the control region`);
}
module.exports = { checkInvalidTint };
