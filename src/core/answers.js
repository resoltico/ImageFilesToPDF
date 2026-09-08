"use strict";

const { CHOICE_ROWS, COLOUR_ROW, NUMBER_ROWS } = require("./form.js");
const { valueOfLabel } = require("./choices.js");
const { normalizeColour } = require("./colour.js");
const { errorMessage } = require("./errors.js");

/*
 * Turning what a person answered into settings, or into a list of what is
 * wrong with it.
 *
 * Both front ends read their answers through here, which is the whole point
 * of the file: the form asks six questions at once and collects every
 * problem, the stepwise dialogs ask one and ask again, and what an answer may
 * be -- and the sentence said when it may not -- is the same either way. The
 * rule for a number used to be written three times over, with three wordings
 * for one rule, and the two front ends disagreed about which to say.
 *
 * A reader returns the value or throws the sentence, and the sentence names
 * the setting it is about: the form lists six of them together, where one
 * that does not name itself is a sentence about nothing.
 *
 * A problem carries the key of its row as well. Listing the sentences tells a
 * person what is wrong; the key is what lets the form also show them where.
 */

const DIGITS = /^\d+$/u;

/*
 * Digits, or it is a mistake. Deliberately stricter than the coercion used on
 * a headless configuration, where a JSON number is a number: Number() also
 * reads "0x12C" and "3e2" as 300, and turning either of those into a
 * resolution would be guessing rather than reading.
 */
function readNumber(control, answer) {
    const text = String(answer).trim();
    const value = parseInt(text, 10);

    if (!DIGITS.test(text) || value < control.minimum || value > control.maximum) {
        throw new Error(
            `${control.label} enter a whole number from ` +
                `${control.minimum} to ${control.maximum}.`
        );
    }

    return value;
}

/*
 * One control, two kinds of answer: the exact label of a preset, or a colour
 * typed in. The labels stay here at the edge and never reach the settings --
 * a headless configuration asking for "White (#FFFFFF)" is asking in the
 * language of a menu, and renaming a preset would change that language.
 *
 * Only an exact label counts. A hex code is not fished out of whatever else
 * was typed around it: "use #C7DAE8 please" is a mistake worth reporting, not
 * an instruction worth obeying.
 */
function readColour(control, answer) {
    const text = String(answer);
    const preset = control.choices.find((choice) => choice.label === text);

    return normalizeColour(preset ? preset.value : text);
}

function readChoice(control, answer) {
    try {
        return valueOfLabel(control, answer);
    } catch {
        throw new Error(`${control.label} "${answer}" is not one of the choices.`);
    }
}

function collect(settings, problems, key, read) {
    try {
        settings[key] = read();
    } catch (error) {
        problems.push({ key, message: errorMessage(error) });
    }
}

/*
 * Every problem at once. A form that reports the first bad field, and only
 * then the second, is the stepwise dialogs again with extra steps.
 */
function readAnswers(answers) {
    const settings = {};
    const problems = [];

    for (const { key, control } of CHOICE_ROWS) {
        collect(settings, problems, key, () => readChoice(control, answers[key]));
    }

    collect(
        settings,
        problems,
        COLOUR_ROW.key,
        () => readColour(COLOUR_ROW.control, answers[COLOUR_ROW.key])
    );

    for (const { key, control } of NUMBER_ROWS) {
        collect(settings, problems, key, () => readNumber(control, answers[key]));
    }

    return problems.length > 0 ? { problems } : { settings };
}

module.exports = { readAnswers, readNumber, readColour };
