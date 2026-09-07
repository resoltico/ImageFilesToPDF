"use strict";

/*
 * The machine-readable outcome of a headless run.
 *
 * A caller needs the receipt and an exit status, and osascript will carry
 * only one of them: it returns the script's value on success and its error on
 * failure. Writing the receipt out directly settles that, so a run can report
 * what happened and still fail.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    foundation,
    writeReceipt,
    isCompleteSuccess,
    describeIncomplete
} = require("../../../src/runtime/receipt.js");

function fakeNamespace() {
    const written = [];
    const ns = (text) => ({
        dataUsingEncoding: (encoding) => ({ text, encoding })
    });

    ns.NSFileHandle = {
        fileHandleWithStandardOutput: {
            writeData: (data) => written.push(data)
        }
    };

    return { ns, written };
}

test("a run is complete only when nothing was lost on the way", () => {
    assert.equal(
        isCompleteSuccess({ outputs: ["/a.pdf"], failures: [], rejected: [] }),
        true
    );
    assert.equal(
        isCompleteSuccess({ outputs: ["/a.pdf"], failures: [{ name: "b", message: "broke", command: "" }], rejected: [] }),
        false,
        "a conversion that failed"
    );
    assert.equal(
        isCompleteSuccess({ outputs: ["/a.pdf"], failures: [], rejected: [{ name: "x" }] }),
        false,
        "a file that was asked for and refused"
    );
});

test("a result predating the rejection list is still judged", () => {
    // Absent is not the same as non-empty, and defaulting the other way would
    // call every such run incomplete.
    assert.equal(isCompleteSuccess({ outputs: [], failures: [] }), true);
});

test("the reason names every count, so nothing is implied", () => {
    const reason = describeIncomplete({
        outputs: ["/a.pdf"],
        failures: [{ name: "b.png", message: "broke", command: "" }],
        rejected: [{ name: "c.gif" }, { name: "d.gif" }]
    });

    assert.match(reason, /1 produced/u);
    assert.match(reason, /1 failed/u);
    assert.match(reason, /2 not converted/u);
});

test("the receipt is written as UTF-8 to standard output", () => {
    const { ns, written } = fakeNamespace();

    assert.equal(writeReceipt('{"outputs":[]}\n', ns), true);
    assert.equal(written.length, 1);
    assert.equal(written[0].text, '{"outputs":[]}\n');
    assert.equal(written[0].encoding, 4, "NSUTF8StringEncoding");
});

test("no bridge means no receipt, and it says so", () => {
    // Reporting success here would tell a caller a receipt exists when it
    // does not.
    assert.equal(writeReceipt("anything", null), false);
});

test("the bridge is refused rather than assumed", () => {
    assert.equal(foundation(null, {}), null);
    assert.equal(foundation({ import: () => true }, null), null);

    const broken = {
        import() {
            throw new Error("Foundation unavailable");
        }
    };

    assert.equal(foundation(broken, {}), null);
});

test("a working bridge is the namespace it was given", () => {
    const imported = [];
    const ns = { marker: true };

    assert.equal(foundation({ import: (name) => imported.push(name) }, ns), ns);
    assert.deepEqual(imported, ["Foundation"]);
});

test("the reason copes with a result that has no rejection list", () => {
    const reason = describeIncomplete({
        outputs: [],
        failures: [{ name: "a.png", message: "broke", command: "" }]
    });

    assert.match(reason, /0 not converted/u);
});

test("the counts are readable as three, not run together", () => {
    // "1 produced1 failed" is a different number, and it is the one a person
    // reads first.
    assert.equal(
        describeIncomplete({ outputs: ["/a.pdf"], failures: [{ name: "b", message: "broke", command: "" }], rejected: [] }),
        "The request was not completely honoured: " +
            "1 produced, 1 failed, 0 not converted."
    );
});
