"use strict";

/*
 * Reading an image's facts one field at a time, and which header failures are
 * the image's rather than the run's.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { inspectModule } = require("../ports/inspect-module.cjs");
const { OperationError, UserCanceled } = require("../../../src/core/errors.js");

const { scalarFacts, parsedHeader } = inspectModule(require.resolve("../../../src/application/source-inspection.js"), ["scalarFacts", "parsedHeader"]);

const absentField = (field) => new OperationError("vipsheader failed", { diagnostic: { message: `vipsheader: vips_image_get: field "${field}" not found` } });

test("an absent optional field is not a present one", async () => {
    const values = { width: "30", height: "20", bands: "3", "vips-loader": "pngload", interpretation: "srgb" };
    const app = { run(argv) {
        const [, , field] = argv;
        if (Object.hasOwn(values, field)) { return Promise.resolve(values[field]); }
        return Promise.reject(absentField(field));
    } };
    const facts = await scalarFacts(app, "/v/vipsheader", "/w/input-0");
    assert.deepEqual([facts.icc, facts.orientation, facts.pages], [false, 1, 1]);
});

test("a header failure that is the run's, not the image's, is not swallowed", async () => {
    for (const failure of [new UserCanceled(), new Error("helper crashed")]) {
        const app = { run: () => Promise.reject(failure) };
        await assert.rejects(() => parsedHeader(app, "/v/vipsheader", "/w/input-0"), (error) => error === failure);
    }
    const imageFailure = new OperationError("vipsheader failed", { issues: [{ code: "damaged", stage: "inspection", params: {}, message: "damaged" }] });
    assert.equal(await parsedHeader({ run: () => Promise.reject(imageFailure) }, "/v/vipsheader", "/w/input-0"), null);
});
