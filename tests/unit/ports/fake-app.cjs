"use strict";

const { boundedDialog } = require("./fake-dialogs.cjs");

/*
 * A list of answers is given in order, which is how a prompt that asks again
 * after a bad entry can be driven. Only a dialog that offers a text field
 * takes one: a message with an OK button asks nothing and consumes nothing.
 * An Error in the list is raised where the real dialog raises on Cancel.
 */
function answerFor(app, options) {
    if (!options || options.defaultAnswer === undefined) {
        return "";
    }

    return Array.isArray(app.nextAnswer)
        ? app.nextAnswer.shift()
        : app.nextAnswer;
}

function dialogSurface(app) {
    return {
        displayDialog(message, options) {
            app.dialogs.push({ message, options });

            const answer = answerFor(app, options);

            if (answer instanceof Error) {
                throw answer;
            }

            return { textReturned: answer ?? "", buttonReturned: options.defaultButton };
        },

        chooseFromList(options, settings) {
            app.listPrompts.push({ options, settings });

            return app.nextChoice === undefined
                ? [options[0]]
                : app.nextChoice;
        }
    };
}

function createFakeApp() {
    const app = {
        commands: [],
        dialogs: [],
        listPrompts: [],
        includeStandardAdditions: false,
        doShellScript(command) {
            app.commands.push(command);
            throw new Error("Unexpected shell command in a dialog test.");
        }
    };
    const surface = dialogSurface(app);
    surface.displayDialog = boundedDialog(surface.displayDialog);
    return Object.assign(app, surface);
}

module.exports = { createFakeApp };
