"use strict";

const { MKTEMP, RM } = require("../core/executables.js");
const { runArgv, tryArgv } = require("./shell.js");

/*
 * Private temporary workspace lifecycle.
 *
 * The path is checked against the expected mktemp shape before anything is
 * removed recursively, so a surprising mktemp result can never turn into an
 * rm -rf of the wrong directory.
 */

const WORKSPACE_PATTERN = /\/ImageFilesToPDF\.[^/]+$/u;
const NONCE_RANGE = 1000000000;

function createWorkspace(app) {
    const path = String(
        runArgv(
            app,
            [MKTEMP, "-d", "-t", "ImageFilesToPDF"],
            "creating temporary workspace"
        )
    ).trim();

    if (!WORKSPACE_PATTERN.test(path)) {
        throw new Error("mktemp returned an unexpected workspace path.");
    }

    return path;
}

function removeWorkspace(app, path) {
    if (!path || !WORKSPACE_PATTERN.test(path)) {
        return;
    }

    // Cleanup failure must not mask the original outcome.
    tryArgv(app, [RM, "-rf", path]);
}

function nonce() {
    return `${Date.now()}-${Math.floor(Math.random() * NONCE_RANGE)}`;
}

module.exports = { createWorkspace, removeWorkspace, nonce };
