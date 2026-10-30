"use strict";

const { hostError } = require("./cancellation.js");
const { UserCancelled, errorMessage } = require("../core/errors.js");
const { APP_NAME } = require("../core/version.js");
const { labelsOf, valueOfLabel, labelOfValue } = require("./settings-model.js");
const { readNumber } = require("./settings-model.js");

/*
 * Asking one question at a time, where there is no form to ask six at once.
 *
 * Each takes what it should open on, so a run that remembers the last one
 * offers those answers back rather than the compiled defaults -- and a run
 * with nothing to remember passes nothing, and gets them.
 */

/*
 * Presents the labels and returns the value behind the one chosen, so the
 * wording a person sees is never the thing the pipeline stores.
 */
function chooseRequired(app, control, opening) {
    const choice = app.chooseFromList(labelsOf(control), {
        withTitle: APP_NAME,
        withPrompt: control.prompt,
        defaultItems: [labelOfValue(control, opening)]
    });

    if (!choice) {
        throw new UserCancelled();
    }

    return valueOfLabel(control, choice[0]);
}

function nativeDialog(app, message, options) {
    try { return app.displayDialog(message, options); }
    catch (error) { throw hostError(error); }
}

function askUntil(app, question, read) {
    let answer = question.defaultAnswer;
    let problem = "";

    for (;;) {
        const response = nativeDialog(app,
            problem ? `${problem}\n\n${question.prompt}` : question.prompt,
            {
                withTitle: APP_NAME,
                defaultAnswer: answer,
                buttons: ["Cancel", "OK"],
                defaultButton: "OK",
                cancelButton: "Cancel"
            }
        );

        answer = String(response.textReturned);

        try {
            return read(answer, question);
        } catch (error) {
            problem = errorMessage(error);
        }
    }
}

function promptInteger(app, control, opening) {
    return askUntil(app, { ...control, defaultAnswer: opening }, readNumber);
}

module.exports = { chooseRequired, askUntil, promptInteger };
