"use strict";
const { APP_NAME, VERSION } = require("../core/version.js");
const { SETTINGS_SCHEMA, DEFAULT_SETTINGS, validateSettings } = require("../core/settings.js");
const { readTimestamp, TIMESTAMP_FORM } = require("../core/timestamps.js");
const { OperationError } = require("../core/errors.js");
const fs = require("node:fs");
const { TextDecoder } = require("node:util");
const { localPath } = require("./paths.js");

const JSON_INDENT = 2;
const FIRST_SOURCE = 3;
const RUN_LINE = "node Image-Files-to-PDF.cjs --settings <settings.json> -- <path…>";

function choiceCaption(choice) {
    const caption = choice.label ?? choice.name;
    return caption && caption !== choice.value ? `${choice.value} (${caption})` : choice.value;
}

function settingsHelp() {
    return Object.entries(SETTINGS_SCHEMA).map(([field, rule]) => {
        if (rule.kind === "integer") {
            return `  ${field} — ${rule.name}: ${rule.minimum}–${rule.maximum}${rule.unit ? ` ${rule.unit}` : ""}${rule.note ? `; ${rule.note}` : ""}`;
        }
        return `  ${field} — ${rule.name}: ${rule.choices.map(choiceCaption).join(" | ")}${rule.hint ? `; ${rule.hint}` : ""}`;
    }).join("\n");
}

function usage() {
    return `${APP_NAME} ${VERSION}\n\nUsage:\n  node Image-Files-to-PDF.cjs --help\n` +
        "  node Image-Files-to-PDF.cjs --version\n" +
        `  ${RUN_LINE}\n\nSettings (all ${Object.keys(SETTINGS_SCHEMA).length} required):\n` +
        `${settingsHelp()}\n\nExample settings JSON (all required fields):\n${JSON.stringify(DEFAULT_SETTINGS, null, JSON_INDENT)}\n\nOptional run option:\n  timestamp — ${TIMESTAMP_FORM} in local time; default now\n\nPaths may be absolute or relative to the working directory. Settings accept a local file URL or path and must be UTF-8 JSON without a BOM.\n`;
}

// One sentence on what was wrong and the run line; the settings stay in --help.
function usageProblem(args) {
    if (args.length === 0) { return "No arguments were given."; }
    if (args.some((argument) => argument === "")) { return "An argument is empty."; }
    if (["--help", "--version"].includes(args[0])) { return "--help and --version take no other arguments."; }
    if (args[0] !== "--settings") { return `Unknown option: ${args[0]}.`; }
    return "--settings needs a settings file, the -- separator, and at least one path.";
}

function usageMessage(problem) {
    return `${problem}\nUsage: ${RUN_LINE}\nRun with --help to see the settings.`;
}

function requestError(code, message, diagnostic = null) {
    const error = new OperationError(message, { issues: [{ code, stage: "request", message, ...(diagnostic ? { diagnostic } : {}) }] });
    return error;
}

function settingsFileError(path, cause, diagnostic = null) {
    return requestError("settings-file", `Settings file ${cause}: ${path}`, diagnostic);
}

function parsedJSON(text, path) {
    try { return JSON.parse(text); }
    catch (error) {
        const position = /position \d+|line \d+(?: column \d+)?/iu.exec(error.message);
        throw settingsFileError(path, `is not valid JSON${position ? ` (${position[0]})` : ""}`);
    }
}

function jsonConfiguration(text, path) {
    const value = parsedJSON(text, path);
    if (!value || typeof value !== "object" || Array.isArray(value)) { throw settingsFileError(path, "is not an object"); }
    return value;
}

function configurationValues(configuration) {
    const settings = { ...configuration };
    delete settings.timestamp;
    const validated = validateSettings(settings, "keys");
    let timestamp = "";
    if (Object.hasOwn(configuration, "timestamp")) {
        try { timestamp = readTimestamp(configuration.timestamp); }
        catch (error) { validated.issues.push({ code: "timestamp", field: "timestamp", stage: "request", message: error.message }); }
    }
    if (validated.issues.length > 0) {
        const error = new OperationError(validated.issues.map((issue) => issue.message).join("\n"), { issues: validated.issues });
        throw error;
    }
    return { settings: validated.settings, timestamp };
}

const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function settingsBytes(path) {
    try {
        if (!fs.statSync(path).isFile()) { throw settingsFileError(path, "is not a regular file"); }
        // O_NONBLOCK prevents a replaced FIFO from blocking before fstat.
        // eslint-disable-next-line no-bitwise
        const flags = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0);
        const file = fs.openSync(path, flags);
        try {
            if (!fs.fstatSync(file).isFile()) { throw settingsFileError(path, "is not a regular file"); }
            return fs.readFileSync(file);
        } finally { fs.closeSync(file); }
    } catch (error) {
        if (error.issues) { throw error; }
        throw settingsFileError(path, error.code === "ENOENT" ? "not found" : "cannot be read", { message: error.message });
    }
}

function readSettingsFile(path) {
    const data = settingsBytes(path);
    if (data.length === 0) { throw settingsFileError(path, "is empty"); }
    try {
        const text = DECODER.decode(data);
        if (text.startsWith("\uFEFF")) { throw settingsFileError(path, "is not valid JSON (unexpected byte-order mark at position 0)"); }
        return jsonConfiguration(text, path);
    } catch (error) {
        if (error.issues) { throw error; }
        throw settingsFileError(path, "is not UTF-8");
    }
}

function settingsPath(value) {
    try { return localPath(value); }
    catch (error) { throw settingsFileError(value, "is not a valid local path or file URL", { message: error.message }); }
}

function cliCommand(args) {
    if (args.length === 1 && args[0] === "--help") { return { kind: "help", text: usage() }; }
    if (args.length === 1 && args[0] === "--version") { return { kind: "version", text: `${APP_NAME} ${VERSION}\n` }; }
    if (args[0] !== "--settings" || args[2] !== "--" || args.length <= FIRST_SOURCE || args.includes("")) {
        throw requestError("usage", usageMessage(usageProblem(args)));
    }
    const path = settingsPath(args[1]);
    return { kind: "run", invocation: { ...configurationValues(readSettingsFile(path)), inputItems: args.slice(FIRST_SOURCE) } };
}

module.exports = { cliCommand, jsonConfiguration, configurationValues, usage };
