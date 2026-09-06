import { readFromDisk } from "./consistency.mjs";
import { walk } from "./discovery.mjs";
import { root } from "../release.mjs";

/*
 * The documents, which nothing read until one of them was found carrying its
 * own opening twice.
 *
 * It had been spliced in by a script: in a JavaScript replacement string, a
 * dollar followed by a backtick means "everything before the match", so
 * writing a backtick-dollar-backtick into a file through `String.replace`
 * inserts the file's own prefix. Nobody noticed, because prose is read in
 * pieces.
 *
 * Only what a machine can be sure of is checked. Whether the prose is true is
 * read, not computed.
 */

// INSTALL.txt ships in the release and LICENSE is quoted into the artifact's
// header, so both are held to the same hygiene as the Markdown even though
// neither is Markdown.
const PLAIN_DOCUMENTS = new Set(["INSTALL.txt", "LICENSE"]);
const MARKDOWN = /\.md$/u;
const HEADING = /^(?<hashes>#{1,6}) \S/u;
const TITLE_LEVEL = 1;

export function isDocument(name) {
    return MARKDOWN.test(name) || PLAIN_DOCUMENTS.has(name);
}

/*
 * Each heading with the headings it sits under.
 *
 * Compared whole, a Keep a Changelog file repeats "### Fixed" under every
 * release that fixed something, and those are different sections. With their
 * parents they are different strings, while a run of text spliced into a
 * document brings its parents along and collides.
 */
export function headingPathsIn(text) {
    const ancestors = [];

    return text.split("\n").flatMap((line) => {
        const level = HEADING.exec(line)?.groups.hashes.length;

        if (!level) {
            return [];
        }

        ancestors.length = level - 1;
        ancestors[level - 1] = line;

        return [{ line, path: ancestors.filter(Boolean).join(" > ") }];
    });
}

function assertOneTitle(file, headings) {
    const titles = headings.filter(
        (heading) => HEADING.exec(heading.line).groups.hashes.length === TITLE_LEVEL
    );

    if (titles.length !== 1) {
        throw new Error(
            `${file}: has ${titles.length} top-level headings; a document is ` +
            "one document and says so once"
        );
    }

    if (headings[0] !== titles[0]) {
        throw new Error(
            `${file}: opens with ${headings[0].line} before its title`
        );
    }
}

function assertSectionsDiffer(file, headings) {
    const seen = new Set();

    for (const { line, path } of headings) {
        if (seen.has(path)) {
            throw new Error(
                `${file}: repeats ${line} in the same place; two sections ` +
                "cannot be the same section, and text spliced into a document " +
                "is how that happens"
            );
        }

        seen.add(path);
    }
}

export function assertClean(file, text) {
    if (/[ \t]+$/mu.test(text)) {
        throw new Error(`${file}: has trailing whitespace`);
    }

    if (text.includes("\r")) {
        throw new Error(`${file}: has a carriage return`);
    }

    if (!text.endsWith("\n")) {
        throw new Error(`${file}: does not end with a newline`);
    }
}

export function checkDocument(file, text) {
    assertClean(file, text);

    if (!MARKDOWN.test(file)) {
        return;
    }

    const headings = headingPathsIn(text);

    if (headings.length === 0) {
        throw new Error(`${file}: has no headings; it is not a document`);
    }

    assertOneTitle(file, headings);
    assertSectionsDiffer(file, headings);
}

export async function documentNames(find = walk) {
    return await find("", root, isDocument);
}

/*
 * Read together and checked in order, so two broken documents always report
 * the same one first.
 */
export async function checkDocuments(read = readFromDisk, find = walk) {
    const files = await documentNames(find);

    if (files.length === 0) {
        throw new Error("no documents found; the check would pass vacuously");
    }

    const texts = await Promise.all(files.map((file) => read(file)));

    files.forEach((file, index) => checkDocument(file, texts[index]));

    return { files, texts };
}
