# Contributing

## Setup and commands

Use the Node pin in `.node-version`; `mise install` reads the matching
`mise.toml` declaration. `package.json` declares the npm pin and minimum engines.
Install npm, then restore the locked development dependencies:

```sh
npm install --global "$(node --print 'require("./package.json").packageManager')"
npm ci --ignore-scripts
```

Keep optional platform packages enabled: the pinned esbuild installation uses
them. No development package is a runtime dependency of the generated JXA.

The `glob` and `minimatch` overrides in `package.json` form a compatible pair and
address GHSA-g3hv-75wg-m249 and GHSA-3g3m-2fjr-6pw4. Update them together; remove
them only when upstream ESLint and Stryker ranges exclude the affected versions.
The `qs` override addresses GHSA-6pq8-jhm2-2vcw in `typed-rest-client`; remove it
when the upstream range excludes affected versions.

| Command | Purpose |
| --- | --- |
| `npm run build` | Regenerate JXA and checksum manifest |
| `npm run quality` | Full source/test/mutation/freshness gate without rebuilding |
| `npm run test:integration:macos` | Real macOS/backend/filesystem/renderer suites |
| `npm run release` | Local build followed by the full quality gate; does not publish |

For native integration, install the same tools required by CI:

```sh
brew update
brew install vips pdfcpu qpdf poppler libtiff exiftool shellcheck actionlint
```

See [QA.md](QA.md) for verification requirements and live-host checks.
Commit both generated bundles and checksums alongside source changes that affect them.

## Source and ownership boundaries

- `src/core/` declares portable settings, source and output rules, outcome
  kinds, wording, and the engine's message fields.
- `src/application/` sequences setup, inspection, conversion, publication and
  recovery through asynchronous ports.
- `src/backend/` builds native arguments and parses vips and pdfcpu responses.
- `src/engine/` provides Node filesystem, process, platform and workspace ports.
- `src/cli/` owns terminal grammar, reports, native path rendering and receipts.
  `src/serve/` runs the engine's UTF-8 JSON-lines session.
- `src/finder/` collects Shortcuts and Finder input, presents AppKit interfaces,
  remembers page settings, and invokes the embedded engine.

The lint and compiled dependency graph checks reject Finder access to
conversion adapters, peer CLI and serve imports, and outer dependencies from
core. Node built-ins belong to the Node adapters. The Finder client communicates
with the engine over the protocol.

The macOS helper reads native package and alias properties and performs
exclusive rename. The Windows helper supplies hidden attributes, drive type,
known Downloads, workspace ACLs, process start times and exclusive move.
Helper lifetimes follow the process and its input stream. Linux needs
no platform helper.

The workspace guard exists before the engine starts a native writer. It stays
until the writer and its streams close. During parallel source work it
covers all active commands, and uncertain settlement leaves the guard in place.
Retention and release follow the artifact rules in `src/core/artifacts.js`.
Published and recovered paths become authoritative after exclusive claim
and verification of identity, size and stored basename.

Name equivalence probes use the actual destination namespace and directory
identity. Source capture verifies the handle and the named path before and
after copying. Inspection and rendering work from the same private bytes.
See [SECURITY.md](SECURITY.md) for the file-safety boundary.

## Interface wording

Image Files to PDF and its sibling [Stamp Images](https://github.com/resoltico/StampImages)
are Finder Quick Actions on the same stack, used by the same people, so they share
one set of interface conventions and one document layout. Mirror a change here in
the sibling repository.

- US English everywhere: UI text, receipt tokens and messages, documents, comments
  and identifiers. Preference domains and keys do not change.
- Selected files are *images*; outputs are *PDFs* (*stamped copies* in the sibling).
  Buttons are `Create`, `Cancel`, `Continue`, `Stop`, `OK`, `Show in Finder`,
  `Details` and `Back`.
- Settings form: the message line is `Choose the page settings, then Create.`; the
  note opens with `<N images> → <outputs>, saved in <place>` and `Save locations:`.
  Corrections say `Correct the highlighted setting, listed below.` and the note lists
  them first. Range hints use an en dash and a unit (`72–1017 ppi`); color presets
  add `or type #RRGGBB`.
- Selection review: `<N items> in your selection cannot be included.`, then
  `Not included:` with `<name>: <reason sentence>` and `in <folder>`, ending
  `Continue with <N images>?`.
- Completion: `Created …` or `No … was created.`, prefixed `Finished with issues.`
  or `Stopped.`; PDFs saved elsewhere are counted in the headline, and refusals
  agreed to in the review do not add `Finished with issues.`. The detail lists the
  non-zero counts, `Saved to:`, failed-only `Could not convert:`, `Saved elsewhere:`
  with one-line causes, `Other issues:`, `Not started`,
  `Not included from your selection:`, `Elapsed:` and, in the dialog only, the
  version. `Show in Finder` reveals every saved or recovered PDF; `Details` shows
  `key: value` lines and `Back` returns to the summary.
- Command line: usage errors name the problem, show the run line and help hint,
  and attempt a JSON receipt with state `invalid-request`; `--help` lists the required
  fields and a complete, ready-to-copy JSON example;
  prose precedes the one receipt attempt, and stderr sections are separated by
  one blank line; receipts share the state and
  issue-code vocabulary in [HEADLESS.md](HEADLESS.md), omit structured stack keys,
  and are checked against the matching receipt schema without mutating internal
  or GUI diagnostics.
- Documents: README (users), INSTALL.txt (release asset), HEADLESS.md (command
  line), SECURITY.md (trust and file safety), QA.md (verification) and this file,
  with matching section order in both repositories. Documents describe the current
  state only; history belongs in `CHANGELOG.md`.

## Tests and build

Tests that inject ports/fixtures belong in `tests/unit/`; tests that inspect the
real checkout belong in `tests/repo/`. Unit test directories follow the outermost
production layer they import (`core`, `backend`, `application`, then `engine`, `cli`, `serve` or `finder`); inner
layer values may serve as fixtures. A repository test enforces placement for
`require()`, `require.resolve()` and dynamic `import()`. Mutation testing runs unit files. All
production sources and applicable build rules must remain discoverable by their
gates. Coverage is 100% and mutation is at least 96 for the
[pure module declaration](tools/pure-modules.mjs). I/O adapters require the
native suites. Keep behavioral expectations independent of implementation calculations.

ESLint uses `js.configs.all`; exceptions and tuned rules are justified in
`tools/eslint/rules.mjs`. Group modules by responsibility and lifetime, respecting
the active ESLint limits: 25 statements, 80 lines per function, 400 lines per
module and four parameters. Split by responsibility, not implementation order.

Alpha PNG/TIFF normalization uses an image-sized lossless `.v` intermediate
between thumbnail and flatten: one source decode and one final PNG encode.
JPEG re-encoding uses the quality setting; pass-through JPEGs keep their bytes.

`tools/scoped-bundle.mjs` uses the pinned esbuild to build both distributions.
JXA is a Safari 15.4 IIFE that exports `run(input, parameters)` and embeds the
engine as text. Both entry points require Node.js 26.13.1 or later. The CLI
preamble checks the runtime before parsing the Node bundle, whose external
imports are limited to Node built-ins. The two artifacts
have a shared checksum manifest.

Native JXA probes import production modules through `tools/build-probe.mjs`.
The terminal tests invoke the committed CJS and validate its PDFs independently.
Tests use owned fixtures, temporary workspaces and test-only tool overrides.
See the native test commands and required environments in [QA.md](QA.md).

Qualify build/toolchain changes with independent clean Linux/macOS restores and
compare bytes. The Node pin is mirrored in `.node-version`, `mise.toml` and
`package.json` engines and checked for agreement. CI installs the declared npm
pin. CI exercises the CLI runtime floor separately from the development pin.
Native CI pins Linux and Windows conversion tools. Homebrew remains a compatibility probe.

## Documentation and releases

Keep user guidance in [README.md](README.md), the machine contract in
[HEADLESS.md](HEADLESS.md), verification in [QA.md](QA.md), and security boundaries
in [SECURITY.md](SECURITY.md). `INSTALL.txt` is a plain-text release asset; retain
its version heading and actionable installation/removal instructions.
Keep operational docs about supported current behavior. Store run-specific logs,
artifact hashes, audit narratives and superseded evidence outside these guides.

`tools/banner.mjs` derives version, repository and license notices from metadata
and refuses a license other than `AGPL-3.0-only`, which its notice states.
First-party source, tests, tools and docs are covered by the canonical root
`LICENSE` (`AGPL-3.0-only`). Preserve third-party notices. Each generated artifact retains
its license and corresponding-source notice, and releases include the complete
license.

Release publication requires separate authorization. An authorized `v<version>`
tag must match the repository's version declarations and dated release notes.
Pushing it triggers `.github/workflows/release.yml`, which requires macOS and
native CLI qualification, verifies both committed artifacts, rebuilds and
compares bytes, then attests both bundles, the manifest, `INSTALL.txt` and `LICENSE`.
The publish job rechecks checksums, attestations and tag identity. Its release
helpers remain dependency-free and it does not restore an npm cache.

Release notes are extracted from `CHANGELOG.md`. Follow its writing rules in
`AGENTS.md`; do not maintain a second release-summary source. Editing source or
committing to `main` does not authorize a version bump, tag or release.

## Contribution terms

By submitting a contribution (code, documentation, tests or other material) to
this repository, you:

- confirm that you wrote it or otherwise have the right to submit it on these
  terms;
- license it to everyone under this repository's public license,
  `AGPL-3.0-only`; and
- also grant Ervins Strauhmanis a perpetual, worldwide, non-exclusive,
  royalty-free, irrevocable license to use, reproduce, modify, distribute and
  sublicense it, and to license it under other terms, including the commercial
  terms described in [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md).

You keep the copyright in your contribution. Do not submit material you cannot
license on these terms; third-party components keep their own licenses. Each
pull request confirms these terms with the checkbox in its template.
