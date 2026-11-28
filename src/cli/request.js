"use strict";
const { APP_NAME, VERSION } = require("../core/product.js");
const { SETTINGS_SCHEMA, DEFAULT_SETTINGS, validateSettings } = require("../core/settings.js");
const { readTimestamp, TIMESTAMP_FORM } = require("../core/timestamps.js");
const { OperationError } = require("../core/errors.js");
const { issueMessage, issueMessages } = require("../core/messages.js");
const fs = require("node:fs");
const { TextDecoder } = require("node:util");
const { localPath } = require("../engine/paths.js");
const { COMMAND, parseArgs, RUN_LINE } = require("./grammar.js");

const JSON_INDENT = 2;

function choiceCaption(choice) {
    const caption = choice.label ?? choice.name;
    return caption && caption !== choice.value ? `${choice.value} (${caption})` : choice.value;
}

function settingsHelp() {
    return Object.entries(SETTINGS_SCHEMA).map(([field, rule]) => {
        if (rule.kind === "integer") {
            return `  ${field} — ${rule.name}: ${rule.minimum}–${rule.maximum}${rule.unit ? ` ${rule.unit}` : ""}${rule.description ? `; ${rule.description}` : ""}`;
        }
        return `  ${field} — ${rule.name}: ${rule.choices.map(choiceCaption).join(" | ")}${rule.description ? `; ${rule.description}` : ""}`;
    }).join("\n");
}

function usage() {
    return `${APP_NAME} ${VERSION}\n\nUsage:\n  ${COMMAND} --help\n` +
        `  ${COMMAND} --version\n` +
        `  ${RUN_LINE}\n\nSettings (all ${Object.keys(SETTINGS_SCHEMA).length} required):\n` +
        `${settingsHelp()}\n\nExample settings JSON (all required fields):\n${JSON.stringify(DEFAULT_SETTINGS, null, JSON_INDENT)}\n\nOptional run option:\n  timestamp — ${TIMESTAMP_FORM} in local time; default now\n\nPaths may be absolute or relative to the working directory. Settings accept a local file URL or path and must be UTF-8 JSON without a BOM.\n`;
}

function usageMessage(problem) {
    return `${problem}\nUsage: ${RUN_LINE}\nRun with --help to see the settings.`;
}

function requestError(issue) {
    const error = new OperationError(issue.message, { issues: [issue] });
    return error;
}

function settingsFileError(id, params, diagnostic = null) {
    return requestError({ ...issueMessage("settings-file", "request", id, params), ...(diagnostic ? { diagnostic } : {}) });
}

function parsedJSON(text, path) {
    try { return JSON.parse(text); }
    catch (error) {
        const position = /position \d+|line \d+(?: column \d+)?/iu.exec(error.message);
        throw settingsFileError(position ? "settingsFileInvalidJsonAt" : "settingsFileInvalidJson", { path, position: position?.[0] });
    }
}

function jsonConfiguration(text, path) {
    const value = parsedJSON(text, path);
    if (!value || typeof value !== "object" || Array.isArray(value)) { throw settingsFileError("settingsFileNotObject", { path }); }
    return value;
}

function configurationValues(configuration) {
    const settings = { ...configuration };
    delete settings.timestamp;
    const validated = validateSettings(settings, "keys");
    let timestamp = "";
    if (Object.hasOwn(configuration, "timestamp")) {
        try { timestamp = readTimestamp(configuration.timestamp); }
        catch (error) { validated.issues.push({ code: "timestamp", field: "timestamp", stage: "request", params: {}, message: error.message }); }
    }
    if (validated.issues.length > 0) {
        const error = new OperationError(issueMessages(validated.issues), { issues: validated.issues });
        throw error;
    }
    return { settings: validated.settings, timestamp };
}

const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function settingsBytes(path) {
    try {
        if (!fs.statSync(path).isFile()) { throw settingsFileError("settingsFileNotRegular", { path }); }
        // eslint-disable-next-line no-bitwise -- O_NONBLOCK prevents a replaced FIFO from blocking before fstat.
        const flags = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0);
        const file = fs.openSync(path, flags);
        try {
            if (!fs.fstatSync(file).isFile()) { throw settingsFileError("settingsFileNotRegular", { path }); }
            return fs.readFileSync(file);
        } finally { fs.closeSync(file); }
    } catch (error) {
        if (error.issues) { throw error; }
        throw settingsFileError(error.code === "ENOENT" ? "settingsFileMissing" : "settingsFileUnreadable", { path }, { message: error.message });
    }
}

function readSettingsFile(path) {
    const data = settingsBytes(path);
    if (data.length === 0) { throw settingsFileError("settingsFileEmpty", { path }); }
    try {
        const text = DECODER.decode(data);
        if (text.startsWith("\uFEFF")) { throw settingsFileError("settingsFileBom", { path }); }
        return jsonConfiguration(text, path);
    } catch (error) {
        if (error.issues) { throw error; }
        throw settingsFileError("settingsFileNotUtf8", { path });
    }
}

function settingsPath(value) {
    try { return localPath(value); }
    catch (error) { throw settingsFileError("settingsFileNotLocal", { path: value }, { message: error.message }); }
}

function cliCommand(args) {
    const parsed = parseArgs(args);
    if (parsed.problem) { throw requestError({ code: "usage", stage: "request", params: {}, message: usageMessage(parsed.problem) }); }
    if (parsed.kind === "help") { return { kind: "help", text: usage() }; }
    if (parsed.kind === "version") { return { kind: "version", text: `${APP_NAME} ${VERSION}\n` }; }
    const path = settingsPath(parsed.file);
    return { kind: "run", invocation: { ...configurationValues(readSettingsFile(path)), inputItems: parsed.inputItems } };
}

module.exports = { cliCommand };
