"use strict";
const { message } = require("./messages.js");
const { RUN_OUTCOME } = require("./outcomes.js");

const text = (value) => typeof value === "string";
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const strings = (value) => Array.isArray(value) && value.every(text);
const records = (value) => Array.isArray(value) && value.every(record);
const state = (value) => Object.values(RUN_OUTCOME).includes(value);

function fields(value, { required = {}, optional = {} }) {
    return record(value) && Object.keys(value).every((name) => Object.hasOwn(required, name) || Object.hasOwn(optional, name)) &&
        Object.entries(required).every(([name, validate]) => Object.hasOwn(value, name) && validate(value[name])) &&
        Object.entries(optional).every(([name, validate]) => !Object.hasOwn(value, name) || validate(value[name]));
}

const context = (value) => fields(value, {
    required: { count, selectedFolders: count, folders: strings, rejected: records },
    optional: { diagnostics: records }
});
const receipt = (value) => fields(value, {
    required: { state, documents: records, rejected: records, issues: records, diagnostics: records },
    optional: { elapsed: text }
});

const MESSAGES = {
    client: {
        start: { required: { inputItems: strings } }, continue: {}, cancel: {}, settings: { required: { values: record } }, stop: {}
    },
    engine: {
        hello: { required: { version: text, runtime: text } }, phase: { required: { phase: text } },
        progress: { required: { done: count, total: count }, optional: { current: text } },
        review: { required: { context } }, "settings-needed": { required: { context } },
        "settings-invalid": { required: { issues: records } }, outcome: { required: { receipt } }
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

module.exports = { validateMessage };
