"use strict";
const { message } = require("../../core/messages.js");
const { env } = require("node:process");
const path = require("node:path");
const { OperationError, UserCanceled } = require("../../core/errors.js");
const { helperSession } = require("../line-helper.js");
const { windowsReply } = require("./helper-codec.js");
const { windowsHelperArgs } = require("./windows-helper.js");

function windowsNative(commands) {
    const root = env.SystemRoot;
    if (!root || !/^[a-z]:[/\\]/iu.test(root)) { throw new OperationError(message("windowsSystemDirectoryUnavailable")); }
    const executable = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const volumes = new Map();
    let native = null;

    async function ask(type, values = {}) {
        try {
            native ??= helperSession(executable, windowsHelperArgs(), { detached: false });
            return windowsReply(await native.request({ type, ...values }));
        } catch (error) {
            if (commands.stopped()) { throw new UserCanceled(); }
            throw error;
        }
    }

    async function value(type, fields) {
        const reply = await ask(type, fields);
        if (reply.ok) { return reply.value; }
        throw new OperationError(message("windowsPlatformFactUnavailable", { type }), { diagnostic: reply });
    }

    return {
        async local(file) {
            const { root: drive } = path.win32.parse(file);
            const key = drive.toUpperCase();
            if (!volumes.has(key)) { volumes.set(key, value("volume", { root: key })); }
            return ["Fixed", "Removable"].includes(await volumes.get(key));
        },
        entries: (directory) => value("entries", { directory: path.win32.normalize(directory) }),
        downloads: () => value("downloads"),
        startTime: (pid) => value("startTime", { pid }),
        privateDirectory: (file, created) => value("privateDirectory", { path: path.win32.normalize(file), created }),
        move: (from, to) => ask("move", { from: path.win32.toNamespacedPath(from), to: path.win32.toNamespacedPath(to) }),
        close() { return native?.close(); }
    };
}

module.exports = { windowsNative };
