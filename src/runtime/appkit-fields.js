"use strict";

/*
 * The controls a person types into. AppKit is touched here and in
 * appkit-widgets.js and nowhere else; the namespace arrives as a parameter so
 * the composition above can be driven by a fake, and what a fake cannot prove
 * is that any of it renders.
 */

function makeField(ns, text, rect) {
    const field = ns.NSTextField.alloc.initWithFrame(
        ns.NSMakeRect(rect.left, rect.bottom, rect.width, rect.height)
    );

    field.stringValue = text;

    return field;
}

/*
 * A list to choose from and a field to type in, as one control in one row.
 *
 * NSComboBox is the only control that is both, which is what keeps the form
 * at six rows and keeps the background a single setting: there is no second
 * field to reconcile with a menu, and no "Custom..." step that makes a row
 * appear.
 *
 * What it costs is the colour swatch the four presets carried in their menu.
 * A combo box list holds strings, and a swatch beside the field instead would
 * be telling the truth only until the next keystroke -- so the colours
 * themselves are the whole of what the list shows now, and what they are
 * called is said in the form around it.
 *
 * Completion is off deliberately. With it on, typing over a selected preset
 * offers to finish the word, and what the field holds is then something the
 * user did not type.
 */
function makeColourCombo(ns, row, rect) {
    const combo = ns.NSComboBox.alloc.initWithFrame(
        ns.NSMakeRect(rect.left, rect.bottom, rect.width, rect.height)
    );

    combo.usesDataSource = false;
    combo.editable = true;
    combo.completes = false;
    combo.numberOfVisibleItems = row.options.length;
    combo.addItemsWithObjectValues(
        ns(row.options.map((option) => option.label))
    );
    combo.stringValue = row.value;
    combo.setAccessibilityLabel(row.label);

    return combo;
}

module.exports = { makeField, makeColourCombo };
