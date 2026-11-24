/*
 * Dependency-free source gate.
 *
 * Each family of checks lives in its own module under tools/lint/; this file
 * only sequences them.
 */
import { readFile } from "node:fs/promises";
import { sourceFiles } from "./release.mjs";
import { checkPureModules } from "./pure-modules.mjs";
import { lintableFiles } from "./lint/discovery.mjs";
import { checkSourceFile } from "./lint/source-rules.mjs";
import { checkShellScripts } from "./lint/shell-rules.mjs";
import { checkWorkflows } from "./lint/workflow-rules.mjs";
import { checkLanguageTarget } from "./lint/language-target.mjs";
import { checkConsistency } from "./lint/consistency.mjs";
import { checkToolchain } from "./lint/toolchain.mjs";
import { checkIgnores } from "./lint/ignore-rules.mjs";
import { checkDocumentReferences } from "./lint/document-references.mjs";

import { checkSettingsDocs } from "./lint/settings-docs.mjs";
import { checkBoundaries } from "./lint/boundaries.mjs";

import { checkExportConsumers } from "./lint/production-exports.mjs";
import { checkTestImports } from "./lint/test-imports.mjs";

await checkBoundaries();
await checkTestImports();
const sources = await Promise.all((await sourceFiles()).map(async (file) => [file, await readFile(file, "utf8")]));
await checkExportConsumers(new Map(sources));
checkPureModules(new Map(sources));
await checkSettingsDocs();
const files = await lintableFiles();

for (const relativePath of files) {
    await checkSourceFile(relativePath);
}

const shellStatus = await checkShellScripts();
const workflowStatus = await checkWorkflows();


const languageTarget = await checkLanguageTarget();
const consistency = await checkConsistency();
const formulae = await checkToolchain();
const ignored = await checkIgnores();
const documents = await checkDocumentReferences();

console.log(
    `syntax and static policy checks passed for ${files.length} files ` +
    `(shell: ${shellStatus}; ${workflowStatus}; language target: ${languageTarget}; ${consistency}, ${formulae} formulae, ${ignored} ignore rules, ${documents} documents)`
);
