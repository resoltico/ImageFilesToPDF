"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
test("Windows path grammar distinguishes ordinary names from ambiguous namespaces", () => {
    const { ordinaryWindowsPath } = require("../../../src/engine/path-syntax.js");
    for (const name of ["C:\\Photos\\été.png", "D:/Folder/photo.jpg", "photos\\café.png", "..\\photo.png", "name with spaces.jpg"]) {
        assert.ok(ordinaryWindowsPath(name), name);
    }
    for (const name of ["C:photo.jpg", "\\rooted\\photo.jpg", "\\\\server\\folder\\photo.jpg", "\\\\?\\C:\\photo.png",
        "C:/folder/photo.png:stream", "C:/NUL.png", "C:/COM¹.jpg", "trailing space .png ", "trailing-dot."]) {
        assert.equal(ordinaryWindowsPath(name), false, name);
    }
});

test("Windows tool paths keep the normalized path behind the native prefix", () => {
    const { isDriveAbsolute, windowsToolPath, windowsOutputName } = require("../../../src/engine/path-syntax.js");
    assert.equal(isDriveAbsolute("C:/"), true);
    assert.equal(isDriveAbsolute("C:\\photos"), true);
    assert.equal(isDriveAbsolute("C:photos"), false);
    assert.equal(isDriveAbsolute("CC:/photos"), false);
    assert.equal(windowsToolPath("c:/folder/sub/../été.png"), "\\\\?\\c:\\folder\\été.png");
    assert.equal(windowsOutputName("con.jpg"), "_con.jpg");
    assert.equal(windowsOutputName("photo.jpg"), "photo.jpg");
});
