"use strict";

const { normalizeSettings } = require("./settings.js");
const { answersFromSettings } = require("./answers.js");

/*
 * What a run remembers of the last one, and what it makes of finding it.
 *
 * Six answers, kept as one record under one key, because two keys can be
 * written by two runs at once and leave a paper size from one beside a
 * background from the other. One record cannot: the last run to confirm its
 * settings is the one whose settings are there.
 *
 * The record holds settings rather than answers -- what the pipeline stores,
 * not what a control was showing. A label is display text that renaming a
 * preset would change, and a file written last month should not depend on
 * this month's wording.
 *
 * What comes back is not trusted. It has been on disk, where anything can
 * edit it, so it goes through the same validation as a headless
 * configuration -- the same function, not a second one that agrees with it
 * today. Anything unreadable, unrecognised or out of range is no answer at
 * all, and the run opens on the compiled defaults exactly as it always did.
 *
 * A record from a newer version is left alone rather than repaired or
 * removed: this version cannot know what it means, and deleting what a later
 * one wrote would be a downgrade quietly costing somebody their settings.
 */

const DOMAIN = "com.resoltico.ImageFilesToPDF";
const KEY = "lastSettings";
const SCHEMA = 1;

function encode(settings) {
    return JSON.stringify({ schema: SCHEMA, settings });
}

function held(text) {
    try {
        return JSON.parse(String(text));
    } catch {
        return null;
    }
}

/*
 * The answers a remembered run would have given, or nothing at all. One
 * function because the runtime has one question -- what should the form open
 * on -- and every way of failing to answer it has the same reply.
 */
function rememberedAnswers(text) {
    const record = held(text);

    if (!record || record.schema !== SCHEMA) {
        return null;
    }

    try {
        return answersFromSettings(normalizeSettings(record.settings ?? {}));
    } catch {
        return null;
    }
}

module.exports = { DOMAIN, KEY, SCHEMA, encode, rememberedAnswers };
