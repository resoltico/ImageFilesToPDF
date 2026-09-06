import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { root } from "../repository.mjs";

const WORKFLOW_ROOT = ".github/workflows";
const WORKFLOW_EXTENSION = /\.ya?ml$/u;

/*
 * An empty result means the workflows moved or the glob broke, which would
 * otherwise read as "everything passed".
 */
export function assertWorkflowsFound(files) {
    if (files.length === 0) {
        throw new Error("no workflows found; the gate expects .github/workflows");
    }
}

export function isWorkflow(name) {
    return WORKFLOW_EXTENSION.test(name);
}

/*
 * Filtered so nothing but a workflow is handed to actionlint, and sorted so
 * the gate reports the same order every run.
 */
export function selectWorkflows(entries) {
    return entries.filter(isWorkflow).sort();
}

/*
 * Every action must be pinned to a commit, not to a tag or a branch.
 *
 * A tag is a moveable label: whoever controls the action repository can point
 * v4 at different code tomorrow, and the workflow would run it with whatever
 * permissions the job holds. Dependabot rewrites these pins together with
 * their version comments, so pinning costs nothing to maintain — but nothing
 * enforced it, and a single unpinned line would have gone unnoticed.
 */
const USES = /^\s*(?:-\s*)?uses:\s*(?<action>\S+)/gmu;
const COMMIT_PINNED = /@[\da-f]{40}$/u;

export function unpinnedActions(text) {
    return [...String(text).matchAll(USES)]
        .map((match) => match.groups.action)
        // A local action is part of this repository and moves with it.
        .filter((action) => !action.startsWith("./"))
        .filter((action) => !COMMIT_PINNED.test(action));
}

export function assertPinned(file, text) {
    const loose = unpinnedActions(text);

    if (loose.length > 0) {
        throw new Error(
            `${file}: actions must be pinned to a commit SHA, not a tag: ${
                loose.join(", ")}`
        );
    }
}

async function workflowFiles() {
    return selectWorkflows(await readdir(path.join(root, WORKFLOW_ROOT)));
}

export function probeActionlint(exec = execFileSync) {
    exec("actionlint", ["--version"], { stdio: "ignore" });
}

export function hasActionlint(probe = probeActionlint) {
    try {
        probe();

        return true;
    } catch {
        return false;
    }
}

/*
 * The workflows are the one part of this project that has never executed, so a
 * mistake in them surfaces on a first push rather than in the gate. actionlint
 * checks the schema, the expression syntax, and the shell inside `run:` steps.
 *
 * It is optional in the same way shellcheck is: the gate must stay runnable on
 * a machine that does not have it, and CI installs it.
 */
/*
 * Workflows live in one place and are text, not bytes: read as a Buffer the
 * pinning patterns would match nothing and every workflow would look clean.
 */
export function readWorkflow(file, read = readFile) {
    return read(path.join(root, WORKFLOW_ROOT, file), "utf8");
}

export function runActionlint(files, exec = execFileSync) {
    exec("actionlint", files, { stdio: "inherit" });
}

export async function checkWorkflows(options = {}) {
    // The probe is a parameter so that the decision to run actionlint can
    // be tested, not only the two answers it leads to.
    const available = options.available ?? hasActionlint(options.probe);
    const found = options.files ?? await workflowFiles();
    const run = options.run ?? runActionlint;

    assertWorkflowsFound(found);

    const read = options.read ?? readWorkflow;

    await Promise.all(found.map(async (file) => {
        assertPinned(file, await read(file));
    }));

    if (!available) {
        return `${found.length} workflows (actionlint not installed, skipped)`;
    }

    // A non-zero exit throws, which fails the gate. Injected like the probe,
    // so the branch can be exercised on a machine that does not have
    // actionlint — which every Linux runner in this repository is.
    run(found.map((file) => path.join(root, WORKFLOW_ROOT, file)));

    return `${found.length} workflows, actionlint passed`;
}
