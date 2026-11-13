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

The minimatch and glob overrides keep development tools off releases affected by
GHSA-g3hv-75wg-m249 and GHSA-3g3m-2fjr-6pw4.
They move together: glob 13 expects RegExp pattern parts, while minimatch 11
returns Matcher objects supported by glob 14. Remove these overrides when
all upstream ESLint and Stryker dependency ranges exclude every affected version.
The qs override fixes GHSA-6pq8-jhm2-2vcw in typed-rest-client, whose
pinned qs 6.15.1 is affected; remove it when that range excludes affected versions.

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
Commit generated JXA and checksums alongside source changes that affect them.

## Source and ownership boundaries

- `src/core/` owns portable settings, source policy, planning, ordering, naming,
  geometry, artifact-retention policy and outcome vocabulary.
- `src/application/` owns controller decisions and document/resource sequencing
  through explicit ports. Core and application import no native/UI adapters.
- `src/backend/` owns pure backend argv builders, parsers and command budgeting.
- `src/host/` owns shared setup and native/platform operations. Its
  `quick-action/` and `command-line/` front ends supply interaction ports to one
  use case; neither imports the other, and shared host imports neither.
  Host globals and Apple Event cancellation translation belong here.
- `src/entry.js` exports the production `run` capability.

`tools/lint/boundaries.mjs` enforces import direction and host-global boundaries.
Required source/filesystem/publication capabilities fail setup when absent.
Optional UI, progress and preferences can be unavailable; programming faults must
remain diagnosable rather than silently triggering fallback.

`src/core/settings.js` owns canonical settings, defaults, names, captions, hints
and legal choice IDs. The schema declares field kinds and the documented order;
validation, help, form rows and stepwise dialogs derive from it. `src/host/quick-action/settings-model.js` derives the offered form and
stepwise records from that schema. Text fields are parsed at adapter boundaries
and use the common all-issues validator. `documentPlan` requires complete native
name-equivalence group facts for separate mode. `src/host/destination-names.js` obtains them from
native folder identity and actual namespace probes; coarse search buckets only
limit fallback lookups and never establish equality. Comparison probes use the
owned workspace or an OS-created temporary directory on the destination volume,
with ownership metadata copied before names. Normal and caught-failure paths
remove every allocated probe before encoding. Unicode lookup fallback requires
reliable persistent identities and hard-link support; missing facts stop planning. See
[SECURITY.md](SECURITY.md) for the abrupt-termination boundary. Requested
destination spellings remain unchanged for publication. Numeric RGB components belong to color policy; vips
comma-separated vectors belong to the backend adapter.

`src/core/artifacts.js` owns retention policy. Each artifact is registered before
PDF creation, and executor/publication/workspace cleanup consult that same record.
`building` is disposable; `validating` and `validated` retain unresolved work;
`released` means confirmed publication or recovery permits release. Unknown facts
fail closed. Do not insert fallible owner registration after validation, infer
ownership from filenames, or discard a confirmed destination after a reporting fault.

The document/run outcomes own source mappings, counts and actual saved/recovery
locations. Progress counters do not establish publication. Shared report text belongs to the pure core run-report module; completion
dialog controls, Details and CLI transport stay in their front ends. Keep issue
meaning separate from interface wording and technical diagnostics.

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
  non-zero counts, `Saved to:`, failures, recoveries, `Not started`,
  `Not included from your selection:`, `Elapsed:` and, in the dialog only, the
  version. `Show in Finder` reveals every saved or recovered PDF; `Details` shows
  `key: value` lines and `Back` returns to the summary.
- Command line: the same commands and exit statuses; usage errors name the problem
  and print only the run line; `--help` lists `field — Name: values; default X`;
  stderr sections are separated by one blank line; receipts share the state and
  issue-code vocabulary in [HEADLESS.md](HEADLESS.md).
- Documents: README (users), INSTALL.txt (release asset), HEADLESS.md (command
  line), SECURITY.md (trust and file safety), QA.md (verification) and this file,
  with matching section order in both repositories. Documents describe the current
  state only; history belongs in `CHANGELOG.md`.

## Tests and build

Tests that inject ports/fixtures belong in `tests/unit/`; tests that inspect the
real checkout belong in `tests/repo/`. Mutation testing runs unit files. All
production sources and applicable build rules must remain discoverable by their
gates. Coverage is 100% for core, application and backend; mutation is at least
96 for those same layers. Host adapters require the native suites. Keep behavioral
expectations independent of implementation calculations.

ESLint uses `js.configs.all`; exceptions and tuned rules are justified in
`tools/eslint/rules.mjs`. Group modules by responsibility and lifetime, respecting
the active ESLint limits: 25 statements, 80 lines per function, 400 lines per
module and four parameters. Split by responsibility, not implementation order.

Alpha PNG/TIFF normalization uses an image-sized lossless `.v` intermediate
between thumbnail and flatten: one source decode and one final PNG encode.
JPEG re-encoding uses the quality setting; pass-through JPEGs keep their bytes.

`tools/scoped-bundle.mjs` uses the exact esbuild development pin from
`package.json`: neutral IIFE bundling, Safari 15.4 target, compact whitespace,
readable identifiers and a top-level `run(input, parameters)` bridge. Built-in
availability is checked separately; the compiler supplies no polyfills. The build
rejects omitted source files and external runtime imports.

Native probes use explicit entry files importing production modules through
`tools/build-probe.mjs`. They must not append private global calls to the
production bundle or expose private production APIs. Production end-to-end tests
invoke the actual generated script. `tests/integration/cli.sh` is part of the
native gate and CI; its Node driver orchestrates real osascript processes and
independent PDF inspection. It does not substitute a fake host. Temporary
workspace cleanup must identify this run's ownership; recovery cleanup removes
only the confirmed test file, never its Downloads parent.

Qualify build/toolchain changes with independent clean Linux/macOS restores and
compare bytes. The Node pin is mirrored in `.node-version`, `mise.toml` and
`package.json` engines and checked for agreement. CI installs the declared npm
pin. Homebrew tools are deliberately unpinned and refreshed in CI.

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
`LICENSE` (`AGPL-3.0-only`). Preserve third-party notices. Generated JXA retains
its license and corresponding-source notice, and releases include the complete
license.

Release publication requires separate authorization. An authorized `v<version>`
tag must match the repository's version declarations and dated release notes.
Pushing it triggers `.github/workflows/release.yml`, which qualifies source on
macOS, verifies committed artifact freshness, rebuilds and compares bytes, then
attests and publishes the JXA, checksum manifest, `INSTALL.txt` and `LICENSE`.
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
