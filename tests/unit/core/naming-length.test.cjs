"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { outputNameForSeparate, collisionPath } = require("../../../src/core/naming.js");
const { utf8Length } = require("../../../src/core/utf8.js");

test("ordinary separate names stay readable without a timestamp", () => {
    assert.equal(outputNameForSeparate({ originalName: "holiday photo.jpg" }), "holiday photo.pdf");
});

test("UTF-8 filename bounds leave room for extension disambiguation and collision suffixes", () => {
    for (const character of ["x", "é", "日", "📁"]) {
        for (const distinguish of [false, true]) {
            const name = outputNameForSeparate({ originalName: `${character.repeat(300)}.JPG` }, distinguish);
            assert.ok(utf8Length(collisionPath(name, 9999)) <= 255);
            assert.ok(name.startsWith(character.repeat(2)));
            assert.ok(!name.includes("�"));
            assert.ok(name.endsWith(distinguish ? "-jpg.pdf" : ".pdf"));
        }
    }
});

test("truncated stems are sanitized again and retain their nonempty fallback", () => {
    const name = outputNameForSeparate({ originalName: `${"a".repeat(245)}._x.jpg` });
    assert.equal(name, `${"a".repeat(245)}.pdf`);
    assert.equal(outputNameForSeparate({ originalName: `${".".repeat(300)}.jpg` }), "image.pdf");
});
