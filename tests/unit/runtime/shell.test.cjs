"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    runArgv,
    readTextFile,
    removeFile
} = require("../../../src/runtime/shell.js");
const { createFakeApp, failing } = require("./fake-app.cjs");

test("runArgv quotes every argument before running it", () => {
    const app = createFakeApp();

    runArgv(app, ["/bin/echo", "two words", "a'b"], "testing");

    assert.equal(app.commands[0], "'/bin/echo' 'two words' 'a'\\''b'");
});

test("runArgv returns the host's output", () => {
    const app = createFakeApp([["echo", "hello"]]);

    assert.equal(runArgv(app, ["/bin/echo"], "testing"), "hello");
});

test("runArgv reports the label and the cause, and carries the command", () => {
    // The command is attached rather than inlined: it belongs in a log, not
    // in a dialog shown to someone who right-clicked in Finder.
    const cause = failing("exit 1");
    const app = createFakeApp([["vips", cause]]);

    assert.throws(
        () => runArgv(app, ["/bin/vips", "thumbnail"], "resizing photo.png"),
        (error) => {
            assert.match(error.message, /while resizing photo\.png/u);
            assert.match(error.message, /exit 1/u);
            assert.ok(
                !error.message.includes("/bin/vips"),
                "the argv must not be in the message"
            );
            assert.match(error.command, /'\/bin\/vips' 'thumbnail'/u);
            assert.equal(error.cause, cause);

            return true;
        }
    );
});

test("runArgv omits the context when given no label", () => {
    const app = createFakeApp([["vips", failing("exit 1")]]);

    assert.throws(
        () => runArgv(app, ["/bin/vips"], ""),
        (error) => {
            assert.match(error.message, /^Command failed\.\n/u);
            assert.ok(!error.message.includes("while"));

            return true;
        }
    );
});

test("readTextFile reads through the shell", () => {
    const app = createFakeApp([["/bin/cat", '{"dpi":72}']]);

    assert.equal(readTextFile(app, "/tmp/config.json"), '{"dpi":72}');
    assert.match(app.commands[0], /'\/bin\/cat' '\/tmp\/config\.json'/u);
});

test("a configuration that cannot be read says that is what failed", () => {
    // Every other read in the run is an image; without the label this failure
    // is indistinguishable from one.
    const app = createFakeApp([["/bin/cat", failing("Permission denied")]]);

    assert.throws(
        () => readTextFile(app, "/tmp/config.json"),
        /reading headless configuration/u
    );
});

test("removeFile ignores an absent path and a failing removal", () => {
    const quiet = createFakeApp();

    removeFile(quiet, "");
    assert.equal(quiet.commands.length, 0);

    const failingApp = createFakeApp([["/bin/rm", failing("busy")]]);

    assert.doesNotThrow(() => removeFile(failingApp, "/tmp/x"));

    // -f is not decoration: this is called on paths that may never have been
    // created, and without it rm treats every one of those as an error.
    const app = createFakeApp();

    removeFile(app, "/tmp/x");
    assert.deepEqual(app.commands, ["'/bin/rm' '-f' '/tmp/x'"]);
});


test("technical diagnostics retain a full long argv outside the main explanation",()=>{
    const input="x".repeat(6000);const app=createFakeApp([["/bin/tool",new Error("failed")]]);
    assert.throws(()=>runArgv(app,["/bin/tool",input],"reading source"),(error)=>{
        assert.equal(error.command,`'/bin/tool' '${input}'`);assert.ok(!error.message.includes(input));return true;
    });
});
