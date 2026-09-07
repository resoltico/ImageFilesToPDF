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

/*
 * Dependency order. A module may only depend on modules listed before it,
 * which is asserted during the build rather than assumed.
 */
export const moduleOrder = [
    "src/core/version.js",
    "src/core/executables.js",
    "src/core/numbers.js",
    "src/core/errors.js",
    "src/core/shell.js",
    "src/core/paths.js",
    "src/core/ordering.js",
    "src/core/invocation.js",
    "src/core/settings.js",
    "src/core/geometry.js",
    "src/core/choices.js",
    "src/core/form.js",
    "src/core/form-answers.js",
    "src/core/naming.js",
    "src/core/commands.js",
    "src/core/preflight.js",
    "src/runtime/shell.js",
    "src/runtime/tools.js",
    "src/runtime/workspace.js",
    "src/runtime/preflight.js",
    "src/runtime/appkit-swatch.js",
    "src/runtime/appkit-widgets.js",
    "src/runtime/appkit-form.js",
    "src/runtime/appkit.js",
    "src/runtime/dialogs.js",
    "src/runtime/completion.js",
    "src/runtime/settings-form.js",
    "src/runtime/input.js",
    "src/runtime/admission.js",
    "src/runtime/receipt.js",
    "src/runtime/reporting.js",
    "src/runtime/source-image.js",
    "src/runtime/pages.js",
    "src/runtime/rescue.js",
    "src/runtime/transfer.js",
    "src/runtime/publish.js",
    "src/runtime/pdf.js",
    "src/runtime/job.js",
    "src/runtime/main.js"
];

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

export function digestOf(release) {
    return createHash("sha256").update(release).digest("hex");
}

export function renderManifest(digest) {
    return `${digest}  ${artifactName}\n`;
}
