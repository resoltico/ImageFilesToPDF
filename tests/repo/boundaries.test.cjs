"use strict";
const test = require("node:test");
test("actual production dependency graph satisfies the enforced boundaries", async () => {
    const { checkBoundaries } = await import("../../tools/lint/boundaries.mjs");
    await checkBoundaries();
});
