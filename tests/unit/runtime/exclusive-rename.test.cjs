"use strict";

/*
 * Reaching renamex_np, and what happens when it is not there.
 *
 * The header matters: it is declared in stdio, and importing anything else
 * leaves it undefined -- which is how it was missed the first time it was
 * looked for. A host that cannot reach it is not a host that cannot publish,
 * so the answer is null rather than an error.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRenamer } = require("../../../src/runtime/exclusive-rename.js");

// The name is C's, not this codebase's.
const OPERATION = "renamex_np";

function bridgeOf(namespace, imports = []) {
    return {
        objc: { import: (name) => imports.push(name) },
        ns: namespace
    };
}

test("stdio is what is asked for, because that is where it is declared", () => {
    const imports = [];
    const { objc, ns } = bridgeOf({ [OPERATION]: () => 0 }, imports);

    createRenamer(objc, ns);
    assert.deepEqual(imports, ["stdio"]);
});

test("a rename that returns zero is a publication, and anything else is not", () => {
    const asked = [];
    const { objc, ns } = bridgeOf({
        [OPERATION]: (from, to, flags) => {
            asked.push([from, to, flags]);

            return to === "/a/taken.pdf" ? -1 : 0;
        }
    });
    const renamer = createRenamer(objc, ns);

    assert.equal(renamer.rename("/a/from.pdf", "/a/free.pdf"), true);
    assert.equal(renamer.rename("/a/from.pdf", "/a/taken.pdf"), false);
    // RENAME_EXCL, which is what makes it refuse rather than replace.
    assert.deepEqual(asked[0], ["/a/from.pdf", "/a/free.pdf", 4]);
});

test("a host without the operation, or without a bridge, has none", () => {
    assert.equal(createRenamer(null, {}), null);
    assert.equal(createRenamer({ import() { return undefined; } }, null), null);
    assert.equal(
        createRenamer({ import() { return undefined; } }, { other: 1 }),
        null,
        "a namespace that does not have it"
    );
    // Even where the operation appears to be there: what makes it callable
    // is the header, so a bridge that would not take the header has nothing
    // this code is willing to call.
    assert.equal(
        createRenamer(
            { import() { throw new Error("no stdio"); } },
            { [OPERATION]: () => 0 }
        ),
        null,
        "a bridge that will not import it"
    );
});

test("an operation that throws is a refusal, not a failure of the run", () => {
    const { objc, ns } = bridgeOf({
        [OPERATION]: () => {
            throw new Error("bridge trouble");
        }
    });

    assert.equal(createRenamer(objc, ns).rename("/a/from.pdf", "/a/to.pdf"), false);
});
