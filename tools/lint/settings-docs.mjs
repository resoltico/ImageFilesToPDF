import { readFile } from "node:fs/promises";
import path from "node:path";
import { SETTINGS_SCHEMA } from "../../src/core/settings.js";
import { root } from "../repository.mjs";

export function checkSettingsTable(document, text) {
    for (const [field, rule] of Object.entries(SETTINGS_SCHEMA)) {
        const row = `| \`${field}\` | ${rule.name} |`;
        if (!text.includes(row)) { throw new Error(`${document}: settings table must include ${row}`); }
    }
}

export async function checkSettingsDocs() {
    for (const document of ["README.md", "HEADLESS.md"]) {
        checkSettingsTable(document, await readFile(path.join(root, document), "utf8"));
    }
}
