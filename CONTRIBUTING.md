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

- `src/core/` owns portable settings, source policy, planning, ordering, naming,
  geometry, artifact-retention policy and outcome vocabulary.
- `src/application/` owns selection, inspection, conversion, publication and
  recovery sequencing. Its synchronous workflow receives explicit ports.
- `src/backend/` owns portable native-tool argv builders and output parsers.
  Each process adapter determines whether the full command fits.
- `src/host/` contains the JXA filesystem bridge and Finder presentation.
  `src/entry.js` exports the synchronous Shortcuts handler.
- `src/node/` contains CLI parsing, native process and filesystem ports and
  receipt transport. `src/node/entry.js` is the sole terminal entry point.

`tools/lint/boundaries.mjs` enforces import direction. The build also checks
each entry point's full dependency graph and requires every source module to be
reachable. Node built-ins are available only to the Node adapter.

The Node main thread owns native child processes, signal handling and streams.
A worker runs the shared synchronous workflow. Requests and replies correlate
each child settlement, with bounded process output and a shared Stop latch.
Workspace markers protect an unacknowledged writer across process death. The
Quick Action supplies its progress observer and Apple Event cancellation
translation. Optional observer failures remain diagnostics.

`src/core/settings.js` owns canonical settings, defaults, names, captions, hints
and legal choice IDs. The schema declares field kinds and the documented order;
validation, help, form rows and stepwise dialogs derive from it. `src/host/quick-action/settings-model.js` derives the offered form and
stepwise records from that schema. Text fields are parsed at adapter boundaries
and use the common all-issues validator. `documentPlan` requires complete native
name-equivalence group facts for separate mode. Both adapters use native probes.
For the Finder action, `src/host/destination-names.js` obtains these facts from
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
`src/host/directory-entry-names.js` reads literal POSIX directory entries: Foundation
can normalize its returned names for entries created by POSIX calls on FAT32. The native naming suite
checks an ordinary C rename independently of exclusive-claim support, then
compares the reported basename with raw directory bytes. Stored-name verification
couples a unique exact
or canonical-equivalent candidate to the claimed regular-file identity and size;
normalization is for candidate selection, never for the returned spelling. The
canonical API used for name-equivalence grouping is not a stored-name authority.
Denied or ambiguous listings use the existing original-preservation path. A native
stream close failure carries an explicit `cleanup` issue through publication
context and stops the executor. Preserve all secondary issues and the original
cause/stack; replacing the primary presentation must not discard mandatory cleanup.

The document/run outcomes own source mappings, counts and actual saved/recovery
locations. An explicit verified recovery path remains distinct from a producer
refusal to claim any trustworthy recovery. Progress counters do not establish publication. Shared report text belongs to the pure core run-report module; completion
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
  non-zero counts, `Saved to:`, failed-only `Could not convert:`, `Saved elsewhere:`
  with one-line causes, `Other issues:`, `Not started`,
  `Not included from your selection:`, `Elapsed:` and, in the dialog only, the
  version. `Show in Finder` reveals every saved or recovered PDF; `Details` shows
  `key: value` lines and `Back` returns to the summary.
- Command line: usage errors name the problem, show the run line and help hint,
  and attempt a JSON receipt with state `invalid`; `--help` lists the required
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
production layer they import (`core`, `backend`, `application`, then `host` or `node`); inner
layer values may serve as fixtures. A repository test enforces placement for
`require()`, `require.resolve()` and dynamic `import()`. Mutation testing runs unit files. All
production sources and applicable build rules must remain discoverable by their
gates. Coverage is 100% for core, application, backend and the pure host invocation
parser (`src/host/invocation-syntax.js`); mutation is at least 96 for that same scope.
Host adapters require the native suites. Keep behavioral expectations independent of implementation calculations.

ESLint uses `js.configs.all`; exceptions and tuned rules are justified in
`tools/eslint/rules.mjs`. Group modules by responsibility and lifetime, respecting
the active ESLint limits: 25 statements, 80 lines per function, 400 lines per
module and four parameters. Split by responsibility, not implementation order.

Alpha PNG/TIFF normalization uses an image-sized lossless `.v` intermediate
between thumbnail and flatten: one source decode and one final PNG encode.
JPEG re-encoding uses the quality setting; pass-through JPEGs keep their bytes.

`tools/scoped-bundle.mjs` uses the pinned esbuild to build both distributions.
JXA is a Safari 15.4 IIFE and exports `run(input, parameters)`. The CJS target
is Node 26.13.1 and external imports are limited to its built-ins. The two artifacts
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
