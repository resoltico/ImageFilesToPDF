import { access } from "node:fs/promises";
import path from "node:path";
import { checkDocuments } from "./document-rules.mjs";
import { root } from "../repository.mjs";

/*
 * The files the documents point at have to be there.
 *
 * These documents name modules constantly -- which rule lives where, which
 * module owns the executables, where the bundler is -- and this repository
 * moves modules. A reference that no longer resolves sends a reader looking
 * for something that is not there, and nothing else would notice: the prose
 * still reads perfectly.
 *
 * Only backticked paths count, which is how these documents write a filename,
 * and a path is only a path here if it has a separator in it, at least one
 * letter -- `1/2` is a fraction, and prose is full of them -- and no ellipsis,
 * which means the prose is describing a shape rather than naming a file.
 */

const REFERENCE = /`(?<path>[\w.-]+\/[\w./-]+)`/gu;
const NAMES_SOMETHING = /[a-z]/iu;
const ELLIPSIS = "...";

export function referencesIn(text) {
    return [...text.matchAll(REFERENCE)]
        .map((match) => match.groups.path)
        .filter((reference) => NAMES_SOMETHING.test(reference) &&
            !reference.includes(ELLIPSIS));
}

export async function exists(relative, reach = access) {
    try {
        await reach(path.join(root, relative));

        return true;
    } catch {
        return false;
    }
}

export async function missingReferences(documents, resolve = exists) {
    const named = new Map();

    documents.files.forEach((file, index) => {
        for (const reference of referencesIn(documents.texts[index])) {
            named.set(reference.replace(/\/$/u, ""), file);
        }
    });

    const checked = await Promise.all(
        [...named].map(async ([reference, file]) => [
            reference,
            file,
            await resolve(reference)
        ])
    );

    return checked
        .filter(([, , found]) => !found)
        .map(([reference, file]) => `${reference} (named by ${file})`)
        .sort();
}

export async function checkDocumentReferences(read, find, resolve) {
    const documents = await checkDocuments(read, find);
    const missing = await missingReferences(documents, resolve);

    if (missing.length > 0) {
        throw new Error(
            `documents name files that are not there: ${missing.join(", ")}`
        );
    }

    return documents.files.length;
}
