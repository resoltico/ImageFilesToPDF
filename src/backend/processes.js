"use strict";
const { positiveIntegerFrom } = require("../core/numbers.js");

function buildProcessStartArgv(ps, pid) { return [ps, "-p", String(pid), "-o", "lstart="]; }
function buildProcessListArgv(ps) { return [ps, "-axo", "pid=,lstart="]; }

function readProcessList(text) {
    const lines = String(text).replace(/\r\n?/gu, "\n").trim().split("\n");
    return lines.filter((line) => line.trim() !== "").map((line) => {
        const match = /^\s*(?<pid>\d+)\s+(?<started>\S.*\S)\s*$/u.exec(line);
        if (!match || positiveIntegerFrom(match.groups.pid) === 0) { throw new Error("The process-start list could not be interpreted safely."); }
        return { pid: positiveIntegerFrom(match.groups.pid), started: match.groups.started.trim() };
    });
}
module.exports = { buildProcessStartArgv, buildProcessListArgv, readProcessList };
