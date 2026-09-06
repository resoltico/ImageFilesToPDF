"use strict";

const { CHOICE_ROWS, NUMBER_ROWS } = require("./form.js");
const { valueOfLabel } = require("./choices.js");

/*
 * Turning what the form came back with into settings, or into a list of what
 * is wrong with it.
 *
 * A problem carries the key of the row it belongs to, not just a sentence.
 * Listing the sentences above the form tells a person what is wrong; the key
 * is what lets the form also show them where.
 *
 * Separate from form.js because describing a form and validating one are
 * different jobs, and because both files would otherwise exceed the size the
 * gate allows.
 */

function readChoice(settings, problems, { key, control }, answers) {
    try {
        settings[key] = valueOfLabel(control, answers[key]);
    } catch {
        problems.push({
            key,
            message: `${control.label} "${answers[key]}" is not one of the choices.`
        });
    }
}

function readNumber(settings, problems, { key, control }, answers) {
    const text = String(answers[key]).trim();
    const value = parseInt(text, 10);

    if (!/^\d+$/u.test(text) || value < control.minimum || value > control.maximum) {
        problems.push({
            key,
            message: `${control.label} enter a whole number from ` +
                `${control.minimum} to ${control.maximum}.`
        });

        return;
    }

    settings[key] = value;
}

/*
 * Every problem at once. A form that reports the first bad field, and only
 * then the second, is the stepwise dialogs again with extra steps.
 */
function readAnswers(answers) {
    const settings = {};
    const problems = [];

    for (const row of CHOICE_ROWS) {
        readChoice(settings, problems, row, answers);
    }

    for (const row of NUMBER_ROWS) {
        readNumber(settings, problems, row, answers);
    }

    return problems.length > 0 ? { problems } : { settings };
}

module.exports = { readAnswers };
