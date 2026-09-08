"use strict";

/*
 * A stand-in for the JavaScript for Automation host application.
 *
 * The runtime modules take `app` as a parameter rather than reaching for a
 * global, so the whole macOS layer can be driven from Node with this.
 */

/*
 * `responses` maps a substring of the command to either a string to return or
 * an Error to throw. The first matching entry wins; anything unmatched returns
 * the empty string, which is what a successful silent command produces.
 */
/*
 * vipsheader answers several different questions, so a matcher keyed on the
 * tool name alone would answer them all with the band count. The preflight probes name
 * a file that cannot exist and expect an answer about the file.
 */
const DIRECTORY_TEST = /^'[^']*\/test' '-d' '(?<path>.*)'$/u;

/*
 * Nothing is a directory unless the test says so, which is what a filesystem
 * with no directories in it means. A stub that answered yes to every test
 * made every path a folder.
 */
function refusesDirectory(app, command) {
    const directory = DIRECTORY_TEST.exec(command);

    return Boolean(directory) &&
        !(app.directories ?? []).includes(directory.groups.path);
}

/*
 * The header fields the runtime asks for, with the answers an ordinary image
 * gives. Two of them are not universal, and the code has to tell the cases
 * apart: a file written without metadata has no orientation field, and a
 * single-page format has no n-pages field. vipsheader fails for a field it
 * cannot find, naming it -- which is what the tests that cover those drive
 * directly, because a fake that always answers would hide both.
 */
const HEADER_FIELDS = [
    ["'width'", "width", 600],
    ["'height'", "height", 400],
    ["'orientation'", "orientation", 1],
    ["n-pages", "pages", 1]
];

function cannedAnswer(app, command) {

    const field = HEADER_FIELDS.find(([name]) => command.includes(name));

    if (field) {
        return String(app[field[1]] ?? field[2]);
    }

    if (command.includes("nonexistent-image-files-to-pdf-preflight")) {
        return command.includes("pdfcpu")
            ? "validating(mode=strict) ... no such file"
            : "VipsForeignLoad: file does not exist";
    }

    return undefined;
}

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

            return { textReturned: answer ?? "" };
        },

        chooseFromList(options, settings) {
            app.listPrompts.push({ options, settings });

            return app.nextChoice === undefined
                ? [options[0]]
                : app.nextChoice;
        }
    };
}

function createFakeApp(responses = []) {
    const app = {
        commands: [],
        dialogs: [],
        listPrompts: [],
        includeStandardAdditions: false,

        doShellScript(command) {
            app.commands.push(command);

            for (const [needle, result] of responses) {
                if (command.includes(needle)) {
                    if (result instanceof Error) {
                        throw result;
                    }

                    return result;
                }
            }

            if (refusesDirectory(app, command)) {
                throw new Error("test failed");
            }

            return cannedAnswer(app, command) ?? "";
        }
    };

    return Object.assign(app, dialogSurface(app));
}

function failing(message) {
    return new Error(message);
}

module.exports = { createFakeApp, failing };
