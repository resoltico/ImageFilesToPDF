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
function cannedAnswer(app, command) {
    if (command.includes("'width'")) {
        return String(app.width ?? 600);
    }

    if (command.includes("'height'")) {
        return String(app.height ?? 400);
    }

    if (command.includes("n-pages")) {
        return String(app.pages ?? 1);
    }

    if (command.includes("nonexistent-image-files-to-pdf-preflight")) {
        return command.includes("pdfcpu")
            ? "validating(mode=strict) ... no such file"
            : "VipsForeignLoad: file does not exist";
    }

    return undefined;
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

            return cannedAnswer(app, command) ?? "";
        },

        displayDialog(message, options) {
            app.dialogs.push({ message, options });

            return { textReturned: app.nextAnswer ?? "" };
        },

        chooseFromList(options, settings) {
            app.listPrompts.push({ options, settings });

            return app.nextChoice === undefined
                ? [options[0]]
                : app.nextChoice;
        }
    };

    return app;
}

function failing(message) {
    return new Error(message);
}

module.exports = { createFakeApp, failing };
