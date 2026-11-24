"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { env } = require("node:process");

const { absoluteOr, linuxDownload } = require("./linux-paths.js");

function linuxDownloads(home) {
    const base = absoluteOr(env.XDG_CONFIG_HOME, path.join(home, ".config"));
    try { return linuxDownload(fs.readFileSync(path.join(base, "user-dirs.dirs"), "utf8"), home); }
    catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") { return null; } throw error; }
}

module.exports = { linuxDownloads };
