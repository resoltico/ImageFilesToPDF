"use strict";
const { message } = require("./messages.js");
const { supportsNode } = require("./version.js");
const { RUN_OUTCOME } = require("./outcomes.js");
const { TOOL_NAMES } = require("./executable-search.js");

const text = (value) => typeof value === "string";
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value) => Array.isArray(value) && value.every(text);
const anything = () => true;
const records = (value) => Array.isArray(value) && value.every(record);
const boolean = (value) => typeof value === "boolean";
const state = (value) => Object.values(RUN_OUTCOME).includes(value);

function fields(value, { required = {}, optional = {} }) {
    return record(value) && Object.keys(value).every((name) => Object.hasOwn(required, name) || Object.hasOwn(optional, name)) &&
        Object.entries(required).every(([name, validate]) => Object.hasOwn(value, name) && validate(value[name])) &&
        Object.entries(optional).every(([name, validate]) => !Object.hasOwn(value, name) || validate(value[name]));
}

const issue = (value) => fields(value, {
    required: { code: text, stage: text, params: record, message: text },
    optional: { source: text, field: text, diagnostic: anything }
});
const issues = (value) => Array.isArray(value) && value.every(issue);
const refusal = (value) => fields(value, {
    required: { code: text, stage: text, path: text, name: text, reason: text },
    optional: { diagnostic: anything }
});
const refusals = (value) => Array.isArray(value) && value.every(refusal);

const DOCUMENT_STATES = new Set(["saved", "recovered", "failed", "canceled", "not-started"]);

function document(value) {
    return fields(value, {
        required: { state: (kind) => DOCUMENT_STATES.has(kind), sources: strings, pages: count, issues },
        optional: { output: text, recovery: text, fatal: boolean, diagnostics: records }
    }) && Object.hasOwn(value, "output") === (value.state === "saved") &&
        Object.hasOwn(value, "recovery") === (value.state === "recovered");
}

const documents = (value) => Array.isArray(value) && value.every(document);
const context = (value) => fields(value, {
    required: { count, selectedFolders: count, folders: strings, rejected: refusals },
    optional: { diagnostics: records }
});
const receipt = (value) => fields(value, {
    required: { state, documents, rejected: refusals, issues, diagnostics: records },
    optional: { elapsed: text }
});

const MESSAGES = {
    client: {
        start: { required: { inputItems: strings, toolPaths: (value) => fields(value, {
            optional: Object.fromEntries(TOOL_NAMES.map((name) => [name, text]))
        }) } }, continue: {}, cancel: {}, settings: { required: { values: record } }, stop: {}
    },
    engine: {
        hello: { required: { version: text, runtime: text } }, phase: { required: { phase: text } },
        progress: { required: { done: count, total: count }, optional: { current: text } },
        review: { required: { context } }, "settings-needed": { required: { context } },
        "settings-invalid": { required: { issues } }, outcome: { required: { receipt } }
    }
};

function validateMessage(sender, candidate) {
    if (!record(candidate) || !text(candidate.type) || !Object.hasOwn(MESSAGES, sender) || !Object.hasOwn(MESSAGES[sender], candidate.type)) {
        throw new Error(message("engineMessageTypeInvalid"));
    }
    const { type, ...payload } = candidate;
    if (!fields(payload, MESSAGES[sender][type])) { throw new Error(message("engineMessageFieldsInvalid")); }
    return candidate;
}

function encodeMessage(sender, event) {
    const declared = validateMessage(sender, event);
    return `${JSON.stringify(declared, (key, value) => key === "stack" ? undefined : value)}\n`;
}

function parsedLine(line) {
    try { return JSON.parse(line); }
    catch { throw new Error(message("engineMessageNotJson")); }
}

function decodeMessage(sender, line) {
    return validateMessage(sender, parsedLine(line));
}

function requireHello(event, version) {
    if (event?.type !== "hello" || event.version !== version || !supportsNode(event.runtime)) { throw new Error(message("engineVersionMismatch")); }
}

module.exports = { encodeMessage, decodeMessage, requireHello };
