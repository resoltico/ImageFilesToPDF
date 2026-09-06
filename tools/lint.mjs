/*
 * Dependency-free source gate.
 *
 * Each family of checks lives in its own module under tools/lint/; this file
 * only sequences them.
 */
import { lintableFiles } from "./lint/discovery.mjs";
import { checkSourceFile } from "./lint/source-rules.mjs";
import { checkShellScripts } from "./lint/shell-rules.mjs";
import { checkWorkflows } from "./lint/workflow-rules.mjs";
import { checkLanguageTarget } from "./lint/language-target.mjs";
import { checkConsistency } from "./lint/consistency.mjs";
import { checkToolchain } from "./lint/toolchain.mjs";
import { checkIgnores } from "./lint/ignore-rules.mjs";

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

console.log(
    `syntax and static policy checks passed for ${files.length} files ` +
    `(shell: ${shellStatus}; ${workflowStatus}; language target: ${languageTarget}; ${consistency}, ${formulae} formulae, ${ignored} ignore rules)`
);
