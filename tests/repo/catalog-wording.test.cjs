"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { parseScript } = require("../../tools/javascript.mjs");
const { sourceFiles } = require("../../tools/release.mjs");

const CONSTRUCTORS = new Set(["IssueError", "OperationError"]);
const CATALOG_FUNCTIONS = new Set(["message", "wording", "issueMessages", "publicationFailureDetails", "describeSetupProblems"]);

function* syntaxNodes(value) {
    if (!value || typeof value !== "object") { return; }
    if (typeof value.type === "string") { yield value; }
    for (const child of Object.values(value)) { yield* syntaxNodes(child); }
}

function usesCatalog(argument, bindings) {
    if (argument?.type === "CallExpression") { return CATALOG_FUNCTIONS.has(argument.callee.name); }
    if (argument?.type === "Identifier") {
        const definitions = bindings.filter((binding) => binding.id.name === argument.name);
        return definitions.length > 0 && definitions.every((definition) => usesCatalog(definition.init, []));
    }
    if (argument?.type === "ConditionalExpression") {
        return usesCatalog(argument.consequent, bindings) && usesCatalog(argument.alternate, bindings);
    }
    return argument?.type === "MemberExpression" && ["issue", "failure"].includes(argument.object.name) && argument.property.name === "message";
}

function uncatalogedMessages(source) {
    const nodes = [...syntaxNodes(parseScript(source, "latest"))];
    const bindings = nodes.filter((node) => node.type === "VariableDeclarator");
    return nodes.filter((node) => node.type === "NewExpression" && CONSTRUCTORS.has(node.callee.name))
        .filter((node) => !usesCatalog(node.arguments[0], bindings))
        .map((node) => source.slice(node.start, node.end));
}

function progressArgument(node) {
    if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") { return undefined; }
    const receiver = node.callee.object;
    if (receiver.name !== "progress" && receiver.property?.name !== "progress") { return undefined; }
    const method = node.callee.property.name;
    if (method === "checking") { return node.arguments[2]; }
    return ["phase", "finished"].includes(method) ? node.arguments[0] : undefined;
}

function uncatalogedProgress(source) {
    const nodes = [...syntaxNodes(parseScript(source, "latest"))];
    const bindings = nodes.filter((node) => node.type === "VariableDeclarator");
    return nodes.map(progressArgument).filter((argument) => argument && !usesCatalog(argument, bindings))
        .map((argument) => source.slice(argument.start, argument.end));
}

test("operation and issue errors use core wording or forward an existing issue", async () => {
    const root = join(__dirname, "../..");
    const messages = await Promise.all((await sourceFiles()).map(async (file) =>
        uncatalogedMessages(await readFile(join(root, file), "utf8")).map((source) => ({ file, source }))));
    assert.deepEqual(messages.flat(), []);
});

test("uncataloged literals, template literals and prebuilt wording are rejected", () => {
    assert.equal(uncatalogedMessages('throw new OperationError("Outside the catalog.");').length, 1);
    assert.equal(uncatalogedMessages(`throw new IssueError(\`Missing \${path}.\`);`).length, 1);
    assert.equal(uncatalogedMessages('const text = "Inline."; throw new IssueError(text);').length, 1);
    assert.deepEqual(uncatalogedMessages('const text = message("sourceDamaged"); throw new IssueError(text);'), []);
});

test("application progress announcements use catalog wording", async () => {
    const root = join(__dirname, "../..");
    const files = (await sourceFiles()).filter((file) => file.startsWith("src/application/"));
    const invalid = await Promise.all(files.map(async (file) =>
        uncatalogedProgress(await readFile(join(root, file), "utf8")).map((source) => ({ file, source }))));
    assert.deepEqual(invalid.flat(), []);
});

test("progress controls detect inline, assembled and indirectly supplied wording", () => {
    assert.equal(uncatalogedProgress('progress.phase("Finding images");').length, 1);
    assert.equal(uncatalogedProgress('job.progress.finished("Saved " + label);').length, 1);
    assert.equal(uncatalogedProgress('const title = "Checking"; progress.checking(0, 3, title);').length, 1);
    assert.deepEqual(uncatalogedProgress('progress.phase(message("progressFindingImages")); progress.checking(0, 3);'), []);
});
