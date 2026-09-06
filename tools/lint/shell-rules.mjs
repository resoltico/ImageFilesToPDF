import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { root } from "../release.mjs";
import { checkSize } from "./source-rules.mjs";

const SHELL_ROOT = "tests/integration";
const SHELL_EXTENSION = /\.sh$/u;

export function isShellScript(name) {
    return SHELL_EXTENSION.test(name);
}

export async function shellScripts(directory) {
    const entries = await readdir(path.resolve(root, directory), {
        withFileTypes: true
    });
    const found = [];

    for (const entry of entries) {
        const relative = `${directory}/${entry.name}`;

        if (entry.isDirectory()) {
            found.push(...await shellScripts(relative));
        } else if (isShellScript(entry.name)) {
            found.push(relative);
        }
    }

    return found.sort();
}

/*
 * Shell scripts are held to the same size limit as the JavaScript, so the
 * integration suite cannot grow into a god file either.
 *
 * shellcheck is not a hard requirement, because the source gate must stay
 * runnable anywhere. When it is available (CI installs it) the scripts are
 * held to it.
 */
export async function checkScript(relative) {
    const absolute = path.resolve(root, relative);

    execFileSync("bash", ["-n", absolute]);

    // The same size rule as the JavaScript, not a second copy of it.
    checkSize(relative, await readFile(absolute, "utf8"));
}

function probeShellcheck() {
    execFileSync("shellcheck", ["--version"], { stdio: "ignore" });
}

export function hasShellcheck(probe = probeShellcheck) {
    try {
        probe();

        return true;
    } catch {
        return false;
    }
}

export function runShellcheck(paths, exec = execFileSync) {
    exec("shellcheck", ["--severity=warning", ...paths], { stdio: "inherit" });
}

export async function checkShellScripts(
    available = hasShellcheck(),
    directory = SHELL_ROOT,
    run = runShellcheck
) {
    const scripts = await shellScripts(directory);

    for (const relative of scripts) {
        await checkScript(relative);
    }

    if (!available) {
        return `${scripts.length} scripts (shellcheck not installed, skipped)`;
    }

    // A non-zero exit throws, which fails the gate. Injected so the branch
    // can be exercised where shellcheck is not installed.
    run(scripts.map((script) => path.resolve(root, script)));

    return `${scripts.length} scripts, shellcheck passed`;
}
