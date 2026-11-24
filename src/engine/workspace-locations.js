"use strict";
const os = require("node:os");
const path = require("node:path");
const { env, platform } = require("node:process");
const { OperationError } = require("../core/errors.js");
const { message } = require("../core/messages.js");
const { standardize } = require("./paths.js");
const { absoluteOr, linuxDownloads } = require("./platform/linux.js");

const DRIVE_ABSOLUTE = /^[A-Za-z]:[/\\]/u;
function workspaceRoot(home) {
    if (platform === "win32") {
        if (!DRIVE_ABSOLUTE.test(env.LOCALAPPDATA ?? "")) { throw new OperationError(message("workspaceLocalAppDataUnavailable")); }
        return standardize(path.join(env.LOCALAPPDATA, "Image Files to PDF", "Workspaces"));
    }
    if (platform === "darwin") { return standardize(path.join(home, "Library", "Application Support", "Image Files to PDF", "Workspaces")); }
    const base = absoluteOr(env.XDG_STATE_HOME, path.join(home, ".local", "state"));
    return standardize(path.join(base, "image-files-to-pdf", "workspaces"));
}

function posixDownloads(home) {
    return platform === "darwin" ? path.join(home, "Downloads") : linuxDownloads(home);
}

async function locations(files, windows) {
    const home = os.homedir();
    const configured = windows ? await windows.downloads() : posixDownloads(home);
    const absolute = windows ? DRIVE_ABSOLUTE.test(configured ?? "") : typeof configured === "string" && path.posix.isAbsolute(configured);
    const directory = absolute ? standardize(configured) : null;
    let downloads = null;
    if (directory) {
        try { if (files.checked(directory).kind === "directory") { downloads = `${directory}/`; } }
        catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") { throw error; } }
    }
    return { root: workspaceRoot(home), downloads };
}

module.exports = { locations };
