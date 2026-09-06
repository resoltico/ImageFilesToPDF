"use strict";

/*
 * The colour square shown beside a background option.
 *
 * A name and a hex code ask a person to imagine a colour; a square shows it.
 * The outline is not decoration: white on a white menu is invisible without
 * one, which is exactly the option most people will be choosing.
 */

const SWATCH_SIZE = 12;
const FULL_ALPHA = 1;
const COLOUR_MAX = 255;
const SWATCH_BORDER_ALPHA = 0.3;

// Insetting a one-point stroke by half a point puts it on the pixel grid
// instead of straddling it, which is what keeps the outline crisp.
const STROKE_INSET = 0.5;
const STROKE_TRIM = 1;

function makeSwatch(ns, swatch) {
    const image = ns.NSImage.alloc.initWithSize(
        ns.NSMakeSize(SWATCH_SIZE, SWATCH_SIZE)
    );

    /*
     * lockFocus, set and unlockFocus are zero-argument ObjC methods, which
     * JXA invokes on property access: written with parentheses they would
     * call the result instead. They read as bare expressions to ESLint, and
     * there is no spelling that both works and satisfies the rule.
     */
    /* eslint-disable no-unused-expressions */
    image.lockFocus;
    ns.NSColor.colorWithSRGBRedGreenBlueAlpha(
        swatch.red / COLOUR_MAX,
        swatch.green / COLOUR_MAX,
        swatch.blue / COLOUR_MAX,
        FULL_ALPHA
    ).set;
    ns.NSBezierPath.fillRect(ns.NSMakeRect(0, 0, SWATCH_SIZE, SWATCH_SIZE));
    ns.NSColor.colorWithSRGBRedGreenBlueAlpha(0, 0, 0, SWATCH_BORDER_ALPHA).set;
    ns.NSBezierPath.strokeRect(
        ns.NSMakeRect(
            STROKE_INSET,
            STROKE_INSET,
            SWATCH_SIZE - STROKE_TRIM,
            SWATCH_SIZE - STROKE_TRIM
        )
    );
    image.unlockFocus;
    /* eslint-enable no-unused-expressions */

    return image;
}

module.exports = { SWATCH_SIZE, makeSwatch };
