"use strict";

/*
 * The one address the artifact carries out of this repository, and the four
 * places that state it.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadConsistency } = require("./fake-repo.cjs");

test("the repository URL is one address, stated in four places", async () => {
    // The banner is generated from package.json and cannot drift; the
    // documents a user reads state it in prose, and a stale URL in the file
    // someone follows is worse than no URL at all.
    const { checkRepositoryUrl } = await loadConsistency();
    const agreed = {
        "package.json": JSON.stringify({
            homepage: "https://github.com/someone/Project",
            repository: {
                type: "git",
                url: "git+https://github.com/someone/Project.git"
            }
        }),
        "README.md": "See https://github.com/someone/Project for more.\n",
        "INSTALL.txt": "    https://github.com/someone/Project\n"
    };

    assert.equal(
        await checkRepositoryUrl((file) => Promise.resolve(agreed[file])),
        "https://github.com/someone/Project"
    );
});

test("a document naming a different repository fails the gate", async () => {
    const { checkRepositoryUrl } = await loadConsistency();
    const drifted = {
        "package.json": JSON.stringify({
            homepage: "https://github.com/someone/Project",
            repository: { url: "git+https://github.com/someone/Project.git" }
        }),
        "README.md": "See https://github.com/someone/Renamed for more.\n",
        "INSTALL.txt": "    https://github.com/someone/Project\n"
    };

    await assert.rejects(
        () => checkRepositoryUrl((file) => Promise.resolve(drifted[file])),
        (error) => {
            assert.match(error.message, /repository URLs disagree between files/u);
            assert.match(error.message, /README\.md: .*\/Renamed/u);

            return true;
        }
    );
});

test("a repository whose name ends in .io keeps its name", async () => {
    // npm states the repository as git+URL.git, and both ends have to come
    // off that exact way round. Taking the first ".git" anywhere turns
    // someone.github.io into someonehub.io, and the gate then reports a
    // disagreement between a URL and itself.
    const { checkRepositoryUrl } = await loadConsistency();
    const url = "https://github.com/someone/someone.github.io";
    const agreed = {
        "package.json": JSON.stringify({
            homepage: url,
            repository: { type: "git", url: `git+${url}.git` }
        }),
        "README.md": `See ${url} for more.\n`,
        "INSTALL.txt": `    ${url}\n`
    };

    assert.equal(
        await checkRepositoryUrl((file) => Promise.resolve(agreed[file])),
        url
    );
});

test("the disagreement names every place the URL is stated", async () => {
    // Four sources, and a message that reports the values without saying
    // which file each came from sends the reader to look through all of them.
    const { checkRepositoryUrl } = await loadConsistency();
    const drifted = {
        "package.json": JSON.stringify({
            homepage: "https://github.com/someone/Project",
            repository: { url: "git+https://github.com/someone/Renamed.git" }
        }),
        "README.md": "https://github.com/someone/Project\n",
        "INSTALL.txt": "https://github.com/someone/Project\n"
    };

    await assert.rejects(
        () => checkRepositoryUrl((file) => Promise.resolve(drifted[file])),
        (error) => {
            assert.equal(error.message, [
                "repository URLs disagree between files:",
                "  package.json homepage: https://github.com/someone/Project",
                "  package.json repository: https://github.com/someone/Renamed",
                "  README.md: https://github.com/someone/Project",
                "  INSTALL.txt: https://github.com/someone/Project"
            ].join("\n"));

            return true;
        }
    );
});
