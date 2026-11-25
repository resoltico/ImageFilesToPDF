"use strict";

// The npm command name; tools/lint/consistency.mjs asserts it equals the package name.
const COMMAND = "image-files-to-pdf";
const RUN_LINE = `${COMMAND} --settings <settings.json> [--] <path…>`;
const HELP = new Set(["-h", "--help"]);

function optionError(option) { return `Unknown option: ${option}.`; }

function parseArgs(args) {
    if (args.length === 0) { return { problem: "No arguments were given." }; }
    if (args.includes("")) { return { problem: "An argument is empty." }; }
    const [option, file, ...tail] = args;
    if (HELP.has(option) || option === "--version") {
        if (file !== undefined) { return { problem: `${option} takes no other arguments.` }; }
        return { kind: option === "--version" ? "version" : "help" };
    }
    if (option !== "--settings") {
        return { problem: option.startsWith("-") ? optionError(option) : "--settings must precede the source paths." };
    }
    if (file === undefined || file.startsWith("-")) { return { problem: "--settings needs a settings file." }; }
    const inputItems = [];
    let literal = false;
    for (const token of tail) {
        if (!literal && token === "--") { literal = true; }
        else if (!literal && token.startsWith("-")) { return { problem: optionError(token) }; }
        else { inputItems.push(token); }
    }
    if (inputItems.length === 0) { return { problem: "At least one source path is required." }; }
    return { kind: "run", file, inputItems };
}

module.exports = { COMMAND, parseArgs, RUN_LINE };
