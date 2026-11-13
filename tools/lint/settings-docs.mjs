import { readFile } from "node:fs/promises";
import path from "node:path";
import settings from "../../src/core/settings.js";
import { root } from "../repository.mjs";

const { SETTINGS_SCHEMA } = settings;

export function checkSettingsTable(document, text) {
    let previous = -1;
    for (const [field, rule] of Object.entries(SETTINGS_SCHEMA)) {
        const row = `| \`${field}\` | ${rule.name} |`;
        const index = text.indexOf(row);
        if (index < 0) { throw new Error(`${document}: settings table must include ${row}`); }
        if (index <= previous) { throw new Error(`${document}: settings table order must match the schema`); }
        previous = index;
    }
}

export async function checkSettingsDocs() {
    for (const document of ["README.md", "HEADLESS.md"]) {
        checkSettingsTable(document, await readFile(path.join(root, document), "utf8"));
    }
}
