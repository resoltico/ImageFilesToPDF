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

| Command | Purpose |
| --- | --- |
| `npm run build` | Regenerate JXA and checksum manifest |
| `npm run quality` | Full source/test/mutation/freshness gate without rebuilding |
| `npm run test:integration:macos` | Real macOS/backend/filesystem/renderer suites |
| `npm run release` | Local build followed by the full quality gate; does not publish |

For native integration, install the same tools required by CI:

```sh
brew update
brew install vips pdfcpu qpdf poppler libtiff shellcheck actionlint
```

See [QA.md](QA.md) for verification requirements and live-host checks.
Commit generated JXA and checksums alongside source changes that affect them.

## Source and ownership boundaries

- `src/core/` owns portable settings, source policy, planning, ordering, naming,
  geometry, artifact-retention policy and outcome vocabulary.
- `src/application/` owns controller decisions and document/resource sequencing
  through explicit ports. Core and application import no native/UI adapters.
- `src/backend/` owns pure backend argv builders, parsers and command budgeting.
- `src/host/` owns composition, native/platform operations, transport
  parsing and presentation. Host globals and Apple Event cancellation translation
  belong here.
- `src/entry.js` exports the production `run` capability.

`tools/lint/boundaries.mjs` enforces import direction and host-global boundaries.
Required source/filesystem/publication capabilities fail setup when absent.
Optional UI, progress and preferences can be unavailable; programming faults must
remain diagnosable rather than silently triggering fallback.

`src/core/settings.js` owns canonical settings, defaults, names, captions, hints
and legal choice IDs. `src/host/settings-model.js` derives the offered form and
stepwise records from that schema. Text fields are parsed at adapter boundaries
and use the common all-issues validator. `documentPlan` requires complete native name-equivalence
group facts for separate mode. `src/host/destination-names.js` obtains them from
native folder identity and actual namespace probes; coarse search buckets only
limit fallback lookups and never establish equality. Comparison probes use the
owned workspace or an OS-created temporary directory on the destination volume,
with ownership metadata copied before names. Normal and caught-failure paths
remove every allocated probe before encoding. Unicode lookup fallback requires reliable persistent
identities and hard-link support; missing facts stop planning. See
[SECURITY.md](SECURITY.md) for the abrupt-termination boundary. Requested destination spellings remain
unchanged for publication. Numeric RGB components belong to colour policy; vips
comma-separated vectors belong to the backend adapter.

`src/core/artifacts.js` owns retention policy. Each artifact is registered before
PDF creation, and executor/publication/workspace cleanup consult that same record.
`building` is disposable; `validating` and `validated` retain unresolved work;
`released` means confirmed publication or recovery permits release. Unknown facts
fail closed. Do not insert fallible owner registration after validation, infer
ownership from filenames, or discard a confirmed destination after a reporting fault.

The document/run outcomes own source mappings, counts and actual saved/recovery
locations. Progress counters do not establish publication. Keep issue meaning
separate from interface wording and technical diagnostics.

## Tests and build

Tests that inject ports/fixtures belong in `tests/unit/`; tests that inspect the
real checkout belong in `tests/repo/`. Mutation testing runs unit files. All
production sources and applicable build rules must remain discoverable by their
gates. Coverage is 100% for core, application and backend; mutation is at least
96 for those same layers. Host adapters require the native suites. Keep behavioral expectations independent of implementation calculations.

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

`tools/banner.mjs` derives version, repository and MPL notices from metadata.
First-party source, tests, tools and docs are covered by the canonical root
`LICENSE`. Preserve third-party notices. Generated JXA retains its source/license
notice, and releases include the complete license.

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
