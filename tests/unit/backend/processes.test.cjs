"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildProcessStartArgv, buildProcessListArgv, readProcessList } = require("../../../src/backend/processes.js");

test("process probes request PID/start data without interpreting command strings", () => {
    assert.deepEqual(buildProcessStartArgv("ps", 123), ["ps", "-p", "123", "-o", "lstart="]);
    assert.deepEqual(buildProcessListArgv("ps"), ["ps", "-axo", "pid=,lstart="]);
    assert.deepEqual(readProcessList(" 123 Thu Oct 29 10:00:00 2026\r\n 124 Wed Oct 28 09:00:00 2026 \r\n"), [{ pid: 123, started: "Thu Oct 29 10:00:00 2026" }, { pid: 124, started: "Wed Oct 28 09:00:00 2026" }]);
    assert.deepEqual(readProcessList("\n"), []);
    for (const text of ["not a process", "0 unknown", "123", "123  "]) { assert.throws(() => readProcessList(text), /interpreted safely/u); }
});

test("Apple Event CR-only process output preserves separate PID/start records", () => {
    assert.deepEqual(readProcessList("123 Thu Oct 29 10:00:00 2026\r124 Wed Oct 28 09:00:00 2026\r"), [
        { pid: 123, started: "Thu Oct 29 10:00:00 2026" }, { pid: 124, started: "Wed Oct 28 09:00:00 2026" }
    ]);
});

test("process-list whitespace does not change owner identity", () => {
    assert.deepEqual(readProcessList("123   Thu Oct 29 10:00:00 2026   \n \t\n124   Wed Oct 28 09:00:00 2026"), [
        {pid:123, started:"Thu Oct 29 10:00:00 2026"}, {pid:124, started:"Wed Oct 28 09:00:00 2026"}
    ]);
    assert.throws(() => readProcessList("junk123 Thu Oct 29 10:00:00 2026"), /interpreted safely/u);
});
