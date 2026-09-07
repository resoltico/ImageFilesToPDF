/*
 * Single source of truth for the generated release artifact.
 *
 * Both the builder and the verifier import this, so the two cannot drift.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
    stripModuleSyntax,
    recordDeclarations,
    sectionMarkerFor,
    markerTextsFor
} from "./bundle.mjs";
import { renderBanner, readMetadata } from "./banner.mjs";
import { stripComments } from "./strip-comments.mjs";
import { root } from "./repository.mjs";
import { moduleOrder } from "./module-order.mjs";

/*
 * The supported floor.
 *
 * The Shortcuts app arrived on the Mac in macOS 12 Monterey, which sets the
 * lower bound. Within Monterey the floor is 12.3, whose JavaScriptCore
 * corresponds to Safari 15.4: nobody stays on 12.0 when 12.3 shipped in March
 * 2022 and the line ended at 12.7.x, so the practical cost is nil and it buys
 * the ES2022 built-ins.
 *
 * ECMASCRIPT_TARGET gates syntax through ESLint; late built-ins are a separate
 * check, because a newer built-in is not a syntax error and ESLint's
 * ecmaVersion will not catch one.
 */
export const MINIMUM_MACOS = "12.3";
export const ECMASCRIPT_TARGET = 2022;

/*
 * No spaces: GitHub replaces them with dots when a release asset is uploaded,
 * so a file named with them arrives under a different name than the manifest
 * beside it gives, and neither the checksum nor the documented command works.
 */
export const artifactName = "Image-Files-to-PDF.jxa";
export const artifactPath = path.join(root, "dist", artifactName);
export const manifestPath = path.join(root, "dist", "SHA256SUMS");

async function readRepositoryFile(relative) {
    return await readFile(path.join(root, relative), "utf8");
}

async function renderSection(relativePath, seenModules, declarations) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    const body = stripModuleSyntax(source, relativePath, {
        seenModules,
        root,
        ecmaVersion: ECMASCRIPT_TARGET
    });

    recordDeclarations(body, relativePath, declarations, ECMASCRIPT_TARGET);
    seenModules.add(relativePath);

    return `${sectionMarkerFor(relativePath)}\n\n${body}`;
}

/*
 * osascript invokes run() by name, so the bundle is useless without a
 * top-level declaration of it.
 */
export function assertEntryPoint(declarations) {
    if (!declarations.has("run")) {
        throw new Error(
            "the bundle declares no top-level run(); osascript needs it"
        );
    }
}

export async function renderRelease() {
    const banner = renderBanner(
        await readMetadata(readRepositoryFile, MINIMUM_MACOS)
    );
    const seenModules = new Set();
    const declarations = new Map();
    const sections = [];

    for (const relativePath of moduleOrder) {
        sections.push(
            await renderSection(relativePath, seenModules, declarations)
        );
    }

    assertEntryPoint(declarations);

    return stripComments(
        `${banner}\n\n"use strict";\n\n${sections.join("\n\n")}\n`,
        { ecmaVersion: ECMASCRIPT_TARGET, kept: markerTextsFor(moduleOrder) }
    );
}

export { moduleOrder };

export function digestOf(release) {
    return createHash("sha256").update(release).digest("hex");
}

export function renderManifest(digest) {
    return `${digest}  ${artifactName}\n`;
}
