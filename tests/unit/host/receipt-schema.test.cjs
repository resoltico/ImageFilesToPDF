"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { reportHeadless } = require("../../../src/host/command-line/reporting.js");
const { assertReceipt } = require("../../integration/lib/receipt.cjs");
const schema = require("../../integration/receipt.schema.json");

function receipt() {
    const writes = [];
    reportHeadless({ state: "incomplete", documents: [{ state: "saved", sources: ["/photo.png"], pages: 1, issues: [], output: "/photo.pdf", fatal: false,
        diagnostics: [{ code: "observer-fault", message: "Optional observer failed.", stack: "private" }] }],
    rejected: [{ path: "/vector.png", name: "vector.png", code: "unsupported-content", stage: "inspection", reason: "Unsupported content.", diagnostic: { loader: "svgload", stack: "private" } }],
    issues: [{ code: "fault", stage: "reporting", message: "Useful message.", diagnostic: { stack: "private", nested: [{ stack: "private", text: "stack is text" }] } }],
    diagnostics: [{ code: "workspace-retained", stage: "workspace", message: "Retained work.", diagnostic: { path: "/tmp/ImageFilesToPDF.A123456789" } }], elapsed: "1 second" },
    (text) => writes.push(text), (code) => code);
    return JSON.parse(writes[1]);
}

test("the actual serialized receipt and documented receipt example satisfy the same schema", () => {
    assertReceipt(receipt());
    const text = fs.readFileSync(path.resolve(__dirname, "../../../HEADLESS.md"), "utf8");
    const examples = [...text.matchAll(/```json\n(?<json>[\s\S]*?)\n```/gu)].map((match) => JSON.parse(match.groups.json)).filter((value) => Object.hasOwn(value, "state"));
    assert.equal(examples.length, 1); examples.forEach(assertReceipt);
    for (const field of Object.keys(schema.properties)) { assert.ok(text.includes(`| \`${field}\` |`), field); }
});

test("independent receipt violations are refused rather than silently redefining the documented contract", () => {
    const changes = [
        (value) => { value.rejected[0].message = value.rejected[0].reason; delete value.rejected[0].reason; },
        (value) => { value.rejected[0].message = "Competing field."; },
        (value) => { delete value.documents[0].output; },
        (value) => { value.documents[0].state = "recovered"; delete value.documents[0].output; },
        (value) => { value.documents[0].state = "failed"; },
        (value) => { value.documents[0].state = "failed"; delete value.documents[0].output; value.documents[0].recovery = null; },
        (value) => { value.documents[0].fatal = "yes"; },
        (value) => { value.issues[0].diagnostic.nested[0].stack = "private"; },
        (value) => { value.documents[0].diagnostics[0].stack = "private"; },
        (value) => { value.state = "cancelled"; }
    ];
    for (const change of changes) { const value = receipt(); change(value); assert.throws(() => assertReceipt(value)); }
    const recovered = receipt(); recovered.documents[0].state = "recovered"; recovered.documents[0].recovery = "/tmp/kept.pdf"; delete recovered.documents[0].output;
    assertReceipt(recovered);
    const failed = receipt(); failed.documents[0].state = "failed"; delete failed.documents[0].output; assertReceipt(failed);
});
