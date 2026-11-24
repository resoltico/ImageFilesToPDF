# Verification contract

## Scope and limits

The Finder action requires macOS 13.5 or later and Node.js 26.13.1 or later.
The JXA client has an ES2022 syntax ceiling and a Safari 15.4 target. Its
built-in check applies to the client code. The embedded engine runs in Node.
The [Node.js platform requirements](https://github.com/nodejs/node/blob/v26.13.1/BUILDING.md#platform-list)
set the macOS floor. The CLI also requires Node.js 26.13.1 or later.

Unit tests establish portable rules, application sequencing and adapter calls.
Native suites establish behavior for the actual generated artifact and host used.
Offscreen form captures do not prove keyboard interaction, real Shortcuts helper
permissions, live fallback on a host lacking form capability, or the macOS 13.5
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

Serialized receipts are checked against
[the receipt schema](tests/integration/receipt.schema.json), maintained with
[HEADLESS.md](HEADLESS.md), using the pinned development-only Ajv. Unit negative
controls cover rejected `reason`, conditional saved/recovered paths, optional
record notes and nested stack omission. Actual CLI, naming and recovery receipts
use the same validator in the native suites, separately from the source gate.
Schema validity supplements pixel, file and ownership checks.

The [pure module declaration](tools/pure-modules.mjs) supplies the coverage
and mutation scopes. The gate requires 100% line, branch and function coverage
and a mutation score of at least 96. Adapter checks exercise the production
artifacts and native tools on each host. ESLint rules and deliberate
exceptions are recorded in `tools/eslint/rules.mjs`. Dependency and toolchain pins
live in package.json, package-lock.json, .node-version and mise.toml; clean restores
use `npm ci --ignore-scripts` with the declared npm version.

## Native platform matrix

| Target | Native tools and filesystem | Required checks |
| --- | --- | --- |
| macOS arm64 | macOS 26 CI and current macOS, local APFS, Homebrew libvips and pdfcpu | Committed Node bundle, APFS variants, a second volume, Apple-only HFS+/FAT/exFAT and JXA native probes, live Shortcuts |
| Linux arm64 | Debian 13, ext4, libvips 8.16.1 with HEIF plugins, pdfcpu 0.16.4 | Committed Node bundle, ext4 and a distinct tmpfs device, terminal and crash lifecycle |
| Windows arm64 | Windows 11 ARM runner, NTFS, PowerShell 7, libvips 8.18.7 ARM64 all, pdfcpu 0.16.4 x64 under emulation | Node 26.13.1, PowerShell argv and encoding, console Ctrl+C, NTFS ownership and publication, cross-volume NTFS, FAT32 and exFAT publication |

The pinned Windows variant lacks HEVC. Its negative HEIC case must keep the
source intact and publish no PDF. The Linux variant lacks the Ultra HDR loader.
The HDR and orientation
fixture suite runs on macOS. Additional architectures and filesystem combinations
need their own native evidence. The Windows artifact job mounts a fresh
NTFS test VHD to verify cross-volume publication. A separate job formats fresh
FAT32 and exFAT VHDs. The console test starts a new console and emits a native
Ctrl+C event to it.

`native-cli.cjs` invokes the committed artifact with strict pdfcpu validation,
qpdf structure and page counts, source-byte checks, occupied names, 12
two-process races for each PDF mode, invalid requests, bad overrides and a
broken receipt stream. Set `IFTP_SECOND_VOLUME` to exercise another device.
`posix-process.py` checks terminal Ctrl+C, a writer surviving SIGKILL, dead idle
reclamation, source replacement and native header-argument batching, using
the Python standard library.

## Required native checks

`npm run test:integration:macos` runs these scripts under `tests/integration/` in
sequence:

| Script | Coverage |
| --- | --- |
| `macos.sh` | Actual production entry, dimensions, placement, compression, validation and source integrity |
| `background.sh` | Alpha flattening, page background and color-profile behavior |
| `selection.sh` | Folder traversal, overlap, identity, links, packages, explicit selections and refusal codes |
| `publication.sh` | Occupied entries, permissions, ownership and recoverable failures |
| `volumes.sh` | CLI across APFS and HFS+ in both modes |
| `cards.sh` | Independent FAT32 and exFAT rename probes, occupied-name protection, and publication or validated recovery in both modes |
| `damaged.sh` | Damaged-source refusal, JPEG entropy warnings in pass-through/re-encode, and combined/separate behavior |
| `form.sh` | Production-renderer probe, native geometry/accessibility, shown modal scrollers at zero without fighting later scrolling, Stop button role/feedback and invalid-control pixel/negative controls in both appearances, PNG previews |
| `cli.sh` | CLI grammar/statuses, settings reader, refusal corpus, unusable header overrides, German caller locale, names, JPEG streams, placement, actual INT/TERM/repeats, HEIC/excluded-loader/FIFO refusals and closed/broken stream integrity |
| `hdr.sh` | Synthetic Ultra HDR in both modes, SDR JPEG streams, ICC conversion, orientations 6/8, damage and unmapped-loader diagnostics |
| `naming.sh` | Case and normalization namespaces, folder aliases, hard links, raw stored-basename bytes, long-name/collision budgets and occupied-name protection on local, APFS, APFSX, HFS+, HFSX, FAT32 and exFAT volumes |
| `finder-engine.cjs` | macOS osascript client through the embedded engine, package parity, private cache reuse and tampering, runtime discovery |
| `native-cli.cjs` | Native CLI format, strict PDF, collision race, source integrity and receipt checks |
| `posix-process.py` | Native Stop, crash, writer guard, helper exit, source replacement and argv batching |

ExifTool edits only synthetic HDR fixture metadata; the action does not use it.

Install the native tools listed in [CONTRIBUTING.md](CONTRIBUTING.md). Volume tests
need permission to create and attach disk images. `cards.sh` and `volumes.sh`
report unavailable volume checks as skipped; `naming.sh` requires every listed
volume and fails if one cannot attach. A skip is an unperformed environment check,
never a passing filesystem result. `cards.sh` and
`naming.sh` compare card publication with the native rename probes for free and occupied
destinations. Supported drivers must pass publication and collision checks;
unsupported drivers must leave final names untouched and produce validated
recoveries matching the primitive's error. Unexpected probe errors fail the suite.

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
`tools/build-probe.mjs` using the production scoped bundler. Conversion tests invoke the CLI. The
native Finder harness drives the run handler with synthetic inputs and the
actual embedded engine. Use independent fixtures,
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
  generated bytes and actual JXA execution with Node discovered at an approved absolute path.

Set `IFTP_FORM_PREVIEWS` to an external directory to retain native captures.
Inspect normal, correction, deep-path, multiple-destination and large-detail states
in Aqua and Dark Aqua. Controls and actions must fit within 744 points; complete
variable detail must be selectable and scrollable.

## Platform helpers and recovery

The engine uses one persistent PowerShell helper on Windows and one persistent
osascript helper on macOS. The Windows process-budget check counts process
starts during a 20-image separate run. A representative Windows ARM run
completed 20 documents in 7.42 seconds with one PowerShell process. Native
lifecycle checks cover Ctrl+C, helper exit and workspace retention after a
forced termination.

The durable workspace root is `~/Library/Application Support/Image Files to PDF/Workspaces`
on macOS, `${XDG_STATE_HOME:-$HOME/.local/state}/image-files-to-pdf/workspaces`
on Linux, and `%LOCALAPPDATA%\Image Files to PDF\Workspaces` on Windows.
Recovery uses the system Downloads folder when available. The engine keeps
verified private work when Downloads is absent.

Linux uses hard links for exclusive claims. macOS and Windows can also use
exclusive rename from an owned staging copy. The native FAT32 and exFAT probes
compare the engine result with the observed driver capability and confirm
recovery when the driver refuses an exclusive rename. The macOS 27.2.1 arm64
driver returned errno 45 on both filesystems, and both PDF modes recovered
valid PDFs. Windows uses a no-replace, same-volume move. On FAT32 and exFAT
the native move changes the stored file ID, so the engine checks that an open
handle to the staging file identifies the entry at the destination. The card
suite exercises an occupied name and a same-byte replacement.

OneDrive Files On-Demand placeholders on Windows remain unverified.

## Preparation measurements

On macOS 27.2.1 arm64 with Node.js 26.13.1, libvips 8.18.7 and pdfcpu 0.16.4,
a synthetic corpus of 80 distinct 3000 × 2000 PNGs took 36.78 seconds on the
original sequential artifact, 33.95 seconds on the sequential async engine, and
28.68 seconds with bounded concurrent preparation. Each run used combined A4
portrait output at 300 ppi. All three produced the same PDF name and 80 pages in
natural order. Strict validation passed, and Poppler renders matched for every
page.

The engine starts up to four source captures and inspections per group, capped
by the available processor count minus one with a minimum of one. It admits
encoded pages in plan order, one at a time. The encoded queue holds up to 32
pages and 64 MiB. An oversized page is imported alone before another is encoded.
The workspace writer guard remains until every in-flight command settles.

## Live Shortcuts acceptance

Verification in Shortcuts with the owner present remains pending. The osascript
harness and native form suite exercise the same client and engine outside
ShortcutsMacHelper.

Use an isolated test Shortcut containing the complete current artifact and
synthetic inputs. Preserve the production Shortcut and restore only preferences
changed by the test. Check Finder selection and running without files, the
selection review, all six settings, keyboard navigation, Maximum resolution `1018`,
JPEG quality `101` and background `purple` reported together with other choices
kept, the form note opening at its first line, Create/Cancel, remembered settings,
visible progress/Stop with disabled “Stopping…” feedback, document-level PDF
phases without an image name, one headline above selectable details, Details then Back,
no Details for a plain Stop,
and Show in Finder revealing every saved and recovered PDF. Repeat with no images,
only refused items and a mixed selection. Confirm no text-result files are returned
to Shortcuts.

During a long vips command, time Stop feedback. The button must show
“Stopping…” within 250 milliseconds. Confirm the engine starts its macOS
osascript helper inside ShortcutsMacHelper, and check that the run's Node and
osascript processes have exited after completion and after Stop.

Force an unwritable destination inside the Shortcuts helper and verify the
reported PDF in the system Downloads folder or durable workspace. Test the
form fallback where native form capability is unavailable. Remove disposable test Shortcuts, or
retain a clearly named harness with its inputs for repeatable retesting. A helper
access timeout is an unperformed check, not a pass. Record artifact hash, host,
commands, statuses, full failures and skips outside operational documentation.
Passing evidence applies only to its actual inputs and artifact; a changed build
needs new evidence.
