# Verification contract

## Scope and limits

The target is macOS 12.3 or later, using JavaScriptCore through osascript or
Shortcuts. Source syntax is ES2022; esbuild targets Safari 15.4. A separate
built-in check rejects features unavailable at that floor. These checks do not
establish native interaction on every supported macOS release. Automated native CI
runs on macOS 26.

Unit tests establish portable rules, application sequencing and adapter calls.
Native suites establish behavior for the actual generated artifact and host used.
Offscreen form captures do not prove keyboard interaction, real Shortcuts helper
permissions, live fallback on a host lacking form capability, or the macOS 12.3
floor. Those require live acceptance; do not infer them from CLI success. The
interactive action uses its own progress panel with a native Stop button; do not
rely on JXA `Progress` being visible or stoppable in the Shortcuts helper.

## Automated gates

```sh
npm run quality
npm run test:integration:macos
```

`quality` checks syntax, executable registry, import boundaries, toolchain and
metadata consistency, document links and settings tables, ShellCheck/actionlint
when available, ESLint, unit/repository tests, coverage, mutation and distribution
bytes. It never rebuilds first: stale committed output must fail. Use
`npm run build` to regenerate intentionally. Inspect discovered tests and all skips.

Core, application, pure backend contracts and `src/host/invocation-syntax.js` require
100% line, branch and function coverage and a mutation score of at least 96. Host
adapters are checked through focused unit tests and native production-artifact scenarios; a mocked bridge is
not evidence that macOS rendered or published anything. ESLint rules and deliberate
exceptions are recorded in `tools/eslint/rules.mjs`. Dependency and toolchain pins
live in package.json, package-lock.json, .node-version and mise.toml; clean restores
use `npm ci --ignore-scripts` with the declared npm version.

## Required native checks

`npm run test:integration:macos` runs these scripts under `tests/integration/` in
sequence:

| Script | Coverage |
| --- | --- |
| `macos.sh` | Actual production entry, dimensions, placement, compression, validation and source integrity |
| `background.sh` | Alpha flattening, page background and color-profile behavior |
| `selection.sh` | Folder traversal, overlap, identity, links, packages, explicit selections and refusal codes |
| `publication.sh` | Occupied entries, permissions, ownership and recoverable failures |
| `volumes.sh` | Cross-volume APFS and HFS+ publication in both modes |
| `cards.sh` | FAT32 independent rename probe, publication/collisions or validated recovery, and exFAT recovery, in both modes |
| `damaged.sh` | Damaged-source refusal, JPEG entropy warnings in pass-through/re-encode, and combined/separate behavior |
| `form.sh` | Production-renderer probe, native geometry/accessibility, scrollers at zero and Stop button role/feedback in both appearances, PNG previews |
| `cli.sh` | CLI grammar/statuses, settings reader, refusal corpus, unusable header overrides, German caller locale, names, JPEG streams, placement, TERM, reclaim and retention |
| `hdr.sh` | Synthetic Ultra HDR in both modes, SDR JPEG streams, ICC conversion, orientations 6/8, damage and unmapped-loader diagnostics |
| `naming.sh` | Case and normalization namespaces, folder aliases, hard links and occupied-name protection on local, APFS, APFSX, HFS+, HFSX, FAT32 and exFAT volumes |

ExifTool edits only synthetic HDR fixture metadata; the action does not use it.

Install the native tools listed in [CONTRIBUTING.md](CONTRIBUTING.md). Volume tests
need permission to create and attach disk images; inability to attach one is a
skipped environment check, never a passing filesystem result. `cards.sh` and
`naming.sh` independently probe FAT32 exclusive rename with free and occupied
destinations. Supported drivers must pass publication and collision checks;
unsupported drivers must leave final names untouched and produce validated
recoveries matching the primitive's error. Unexpected probe errors fail the suite.
Recovery is a tested outcome, not a skipped publication assertion.

Volume cleanup resolves the owned image's current whole device through DiskImages,
including when its mount path is gone. It verifies image detachment after bounded
retries and a forced attempt; unreadable state or a still-attached image fails the
suite and preserves its working directory.

Published PDFs require exact page counts and strict pdfcpu validation; qpdf
structure checks and Poppler rendering and pixel assertions check them
independently of pdfcpu. Derive all eight EXIF orientations from an asymmetric
source and check dimensions and corner positions for each. Source hashes must
remain unchanged.

Probe entrypoints import production modules and are built by
`tools/build-probe.mjs` using the production scoped bundler. Ordinary end-to-end
tests invoke `dist/Image-Files-to-PDF.jxa` itself. Use independent fixtures,
expected results and positive controls, and assert that every fault injection ran.

Required lifecycle cases:

- Supported still formats, loader and type checks, animated and multi-image
  refusal, corrupt or unknown metadata, EXIF orientation, ICC profiles, alpha and
  scaling.
- Strict settings types, unknown fields, timestamp presence, canonical defaults
  and equal results from the form and the command line.
- Source changes before, during and after capture; inspection and rendering must
  use identical private bytes.
- Page queue bounds: at most 32 queued pages and 64 MiB of encoded page data, a
  131,072-byte command budget, and merges of at most 32 inputs per level. One newly
  prepared page may coexist with a full queue, an oversized page is imported alone,
  and the final page count must be exact. Measure retained page records and bytes
  separately from process memory.
- At least 12 two-process publication rounds per mode, with unique actual paths,
  complete valid PDFs and occupied entries preserved.
- Faults at workspace registration, validation, release, disposal and reporting;
  after a confirmed validation, the reported recovery must exist with the validated
  bytes in both modes, including after an earlier separate-mode save.
- Stop before and after a save, retained saved and recovered records, truthful
  not-started work and bounded faults from optional observers.
- Fresh Linux and macOS restores with `npm ci --ignore-scripts`, identical
  generated bytes, actual JXA execution and operation without Node on PATH.

Set `IFTP_FORM_PREVIEWS` to an external directory to retain native captures.
Inspect normal, correction, deep-path, multiple-destination and large-detail states
in Aqua and Dark Aqua. Controls and actions must fit within 744 points; complete
variable detail must be selectable and scrollable.

## Live Shortcuts acceptance

Use an isolated test Shortcut containing the complete current artifact and
synthetic inputs. Preserve the production Shortcut and restore only preferences
changed by the test. Check Finder selection and running without files, the
selection review, all six settings, keyboard navigation, Maximum resolution `1018`,
JPEG quality `101` and background `purple` reported together with other choices
kept, the form note opening at its first line, Create/Cancel, remembered settings,
visible progress/Stop, one headline above selectable details, Details then Back,
no Details for a plain Stop,
and Show in Finder revealing every saved and recovered PDF. Repeat with no images,
only refused items and a mixed selection. Confirm no text-result files are returned
to Shortcuts.

Force an unwritable destination inside the actual Shortcuts helper and independently
inspect the reported recovery bytes in Downloads, or the temporary copy when
Downloads is unavailable. Test fallback where native form capability is truly
unavailable; coding faults must be diagnosed. Remove disposable test Shortcuts, or
retain a clearly named harness with its inputs for repeatable retesting. A helper
access timeout is an unperformed check, not a pass. Record artifact hash, host,
commands, statuses, full failures and skips outside operational documentation.
Passing evidence applies only to its actual inputs and artifact; a changed build
needs new evidence.
