"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { ESLint } = require("eslint");

const root = path.resolve(__dirname, "../../..");

test("the ESLint configuration fails a directive that suppresses nothing", async () => {
    const eslint = new ESLint({ cwd: root });
    const [result] = await eslint.lintText(
        "\"use strict\";\n// eslint-disable-next-line no-bitwise -- Probe.\nmodule.exports = { value: 1 };\n",
        { filePath: path.join(root, "src/core/probe.js") }
    );
    assert.deepEqual(result.messages.map(({ severity, message }) => [severity, message.split(" (")[0]]),
        [[2, "Unused eslint-disable directive"]]);
});

test("rules switched off in an area stay on outside it", async () => {
    const eslint = new ESLint({ cwd: root });
    const source = "\"use strict\";\nconsole.log(\"report\");\n";
    const [inside] = await eslint.lintText(source, { filePath: path.join(root, "tests/integration/probe.cjs") });
    const [outside] = await eslint.lintText(source, { filePath: path.join(root, "src/core/probe.js") });
    assert.deepEqual(inside.messages, []);
    assert.deepEqual(outside.messages.map(({ ruleId }) => ruleId), ["no-console"]);
});
