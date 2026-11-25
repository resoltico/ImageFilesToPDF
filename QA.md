# Verification contract

## Scope and limits

The Finder action requires macOS 13.5 or later and Node.js 26.13.1 or later.
The JXA client has an ES2022 syntax ceiling and targets Safari 16.6, the
JavaScriptCore that macOS 13.5 ships. Its built-in check applies to the client code. The embedded engine runs in Node.
The [Node.js platform requirements](https://github.com/nodejs/node/blob/v26.13.1/BUILDING.md#platform-list)
set the macOS floor. Finder execution on macOS 13.5–14 remains unverified. The
MacPorts installation route remains unverified on a host with MacPorts. The CLI
also requires Node.js 26.13.1 or later.

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
bytes. The test import gate checks both `tests/` and `tools/tests/` and rejects
imports of adapter copies, including unlisted modules in the tooling tree.
Native harnesses may import the declared artifact reader. The export gate checks the importing module and
binding, including declared build and native probe entry points. It never rebuilds first: stale committed output must fail. Use
`npm run build` to regenerate intentionally. Inspect discovered tests and all skips.

Serialized receipts are checked against
[the receipt schema](tests/integration/lib/receipt.schema.json), maintained with
[HEADLESS.md](HEADLESS.md), using the pinned development-only Ajv. Unit negative
controls cover rejected `reason`, conditional saved/recovered paths, optional
record notes and nested stack omission. Actual CLI, naming and recovery receipts
use the same validator in the native suites, separately from the source gate.
Schema validity supplements pixel, file and ownership checks.

The [pure module declaration](tools/pure-modules.mjs) supplies the coverage
and mutation scopes. The gate requires 100% line, branch and function coverage
and a mutation score of at least 96. The catalog tests check issue construction
and explicit progress titles at the application boundary. Adapter checks
exercise the production artifacts and native tools on each host. ESLint rules and deliberate
exceptions are recorded in `tools/eslint/rules.mjs`. Dependency and toolchain pins
live in package.json, package-lock.json, .node-version and mise.toml; clean restores
use `npm ci --ignore-scripts` with the declared npm version.

The required GitHub Actions checks on `main` are source quality, macOS
integration, Linux native CLI, and the Windows artifact, cards, arguments and
console jobs.

## Native platform matrix

| Target | Native tools and filesystem | Required checks |
| --- | --- | --- |
| macOS arm64 | macOS 26 CI and current macOS, local APFS, Homebrew libvips and pdfcpu | Committed Node bundle, APFS variants, a second volume, Apple-only HFS+/FAT/exFAT and JXA native probes, live Shortcuts |
| Linux arm64 | Debian 13 Docker image, libvips 8.16.1 with HEIF plugins, pdfcpu 0.16.4 | Committed Node bundle on overlay and a distinct tmpfs device, terminal and crash lifecycle, npm route with the image's npm |
| Linux x86-64 | The same Debian 13 image on an x86-64 runner, pdfcpu 0.16.4 x86-64 | The same checks as Linux arm64 |
| Windows arm64 | Windows 11 ARM runner, NTFS, PowerShell 7, libvips 8.18.7 ARM64 all, pdfcpu 0.16.4 x64 under emulation | Node 26.13.1, PowerShell argv and encoding, console Ctrl+C, NTFS ownership and publication, cross-volume NTFS, FAT32 and exFAT publication, npm route and launchers |
| Windows x86-64 | Windows Server 2025 runner, NTFS, libvips 8.18.7 x64 all, qpdf 12.4.2 x64, pdfcpu 0.16.4 x64 | Native CLI suite, npm route and launchers |

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

## Truncated image diagnostics

The same 16-byte PNG prefix produces a VIPS `not enough data` warning on
macOS and Windows (libvips 8.18.7), and `pngload: end of stream` on Debian
(libvips 8.16.1). The truncated TIFF reports a TIFF directory read error on
macOS and Debian. Windows can report `is not a known file format` for the same
TIFF bytes. For that diagnostic the engine distinguishes damaged PNG, JPEG,
TIFF and WebP by a complete format signature in the first 12 bytes. Admission
reads that prefix through an identity- and version-checked read-only handle.
Preparation uses the bytes collected while making the private copy. The native
fixture requires `damaged` for all four truncated formats and `not-an-image`
for plain text named as PNG. It also checks the original bytes.

## Required native checks

`npm run test:integration:macos` runs the native suites listed below in sequence. Unqualified paths are
relative to `tests/integration/`.

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
| `finder-engine.cjs` | macOS osascript client through the embedded engine, package parity, private cache reuse and tampering, executable discovery and persistence, and scripted stepwise settings after an unusable form |
| `finder-pipe.cjs` | Engine SIGKILL during review and progress, exit and stderr diagnostics, restored SIGPIPE state, helper exit |
| `native-cli.cjs` | Native CLI format, strict PDF, collision race, source integrity and receipt checks |
| `posix-process.py` | Native Stop, crash, writer guard, helper exit, source replacement and argv batching |
| `npm-route.cjs` | The packed npm tarball installed into a private prefix: the command's `--version` and help, a conversion, a missing-tool refusal and uninstall |

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
  122,880-byte POSIX command budget, and merges of at most 32 inputs per level. One newly
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
starts during a 20-image separate run. Windows ARM measurements were 7.13, 7.42
and 9.00 seconds for 20 documents, with one PowerShell process in each run.
Native lifecycle checks cover Ctrl+C, helper exit and workspace retention
after a forced termination.

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
valid PDFs. Successful exclusive rename on a supporting macOS FAT32 driver
remains unverified. Windows uses a no-replace, same-volume move. On FAT32 and exFAT
the native move changes the stored file ID, so the engine checks that an open
handle to the staging file identifies the entry at the destination. The card
suite exercises an occupied name and a same-byte replacement.

The Windows artifact job creates dehydrated PNG and JPEG placeholders through
the Cloud Files API and hydrates them through a local test provider. It checks
the initial and final on-disk data sizes, fetch callbacks, source hashes and
the saved two-page PDF. On the Windows 11 ARM runner, both fixtures hydrated
on their first fetch, retained their placeholder state and kept their source
bytes. Windows hydrates confirmed Cloud Files placeholders
before taking the admission snapshot because hydration can change NTFS change
time. Capture still checks the admitted identity, version and image metadata.
OneDrive remains unverified.

## Preparation measurements

On macOS 27.2.1 arm64 with Node.js 26.13.1, libvips 8.18.7 and pdfcpu 0.16.4,
a synthetic corpus of 80 distinct 3000 × 2000 PNGs took 36.78 seconds on the
original sequential artifact, 33.95 seconds on the sequential async engine, and
28.68 seconds with bounded concurrent preparation. Each run used combined A4
portrait output at 300 ppi. All three produced the same PDF name and 80 pages in
natural order. Strict validation passed, and Poppler renders matched for every
page.

The engine starts up to four source captures and inspections per group, capped
by the available processor count minus one with a minimum of one. The capture
phase shows no individual filename. During ordered page preparation it shows the
image being encoded, and the PDF phases clear that detail. The engine admits
encoded pages in plan order, one at a time. The encoded queue holds up to 32
pages and 64 MiB. An oversized page is imported alone before another is encoded.
The workspace writer guard remains until every in-flight command settles.

## Setup and runtime refusals

Native CLI tests restrict executable discovery and assert setup receipt shape
and platform-specific installation guide references. On macOS, the CLI must also name only
pdfcpu when the two libvips tools are present. Node.js 24.21.0, 25.9.0 and 26.1.0
are refusal probes. The CLI must give exit 3, the detected version and a
schema-valid receipt. Finder checks both discovery adapters against registered
and conventional directories, remembered paths, failed capability probes, and
reselection. The Finder probe checks old runtimes when their paths are supplied
through `IFTP_REJECTED_NODE`.

## npm distribution

`tools/npm-package.mjs` derives the public manifest from `package.json` and
packs the committed CLI artifact, README and LICENSE. Two packs of the same
commit gave the same SHA-256, and the packed CLI is byte-identical to `dist/`.
The native workflow packs one tarball and installs those bytes on every
runner: macOS arm64, Linux arm64 and x86-64 with the npm that the Node image
ships (11.20.0), and Windows arm64 and x86-64.

On both Windows architectures, Windows PowerShell 5.1 refused npm's `.ps1`
launcher under the `Restricted` execution policy and ran it under `RemoteSigned`
and `Bypass`. The `.cmd` launcher ran the command, a conversion and a
missing-tool refusal. A console Ctrl+C through the `.cmd` launcher stopped the
run at its checkpoint with a canceled receipt and exit 1 from Node, and
`cmd.exe` exited with status 1 within 3 seconds, without a batch-job prompt.
The check still ends `cmd.exe` if it waits, because it holds the redirected
receipt open.

The release workflow attests and attaches the tarball and lists it in
`SHA256SUMS`. Its npm job stages the tarball with `npm stage publish` through
trusted publishing when the repository variable `NPM_TRUSTED_PUBLISHING` is
`enabled`. That path is unverified until the first staged release; staging
from a tarball argument and npm's rendering of the README's relative links are
first observed then.

## Live Shortcuts acceptance

On macOS 27.2.1 arm64, the live test verified the imported script byte for byte
and drove the real ShortcutsMacHelper dialogs. It killed the `node --serve`
engine while the settings review was open and clicked Create after the engine
ended. It killed the engine during the Checking images progress phase and pressed
Stop after the engine ended. Both cases reported engine status 9 and kept the
host responsive. The engine and its osascript child exited, and neither case
left a new workspace or PDF.

The progress case delays header inspection before a workspace writer starts.
The native crash suite separately verifies that a workspace remains guarded
when a writer can still be active. The osascript pipe probe checks restoration
of the host's default and ignored SIGPIPE dispositions.

In the same live host, the setup dialog opened the standard file chooser for
an invalid remembered Node path. The selected executable was stored and used
for both version verification and engine launch in later runs. The test
restored the settings and executable preferences it changed.

On macOS 27.2.1, the live Shortcut launches Node and osascript under
ShortcutsMacHelper. The live checks exercise Finder selection, settings
correction and recall, cancellation, normal completion, progress streaming
and recovery to Downloads. Tab moves focus in the settings window. Show in
Finder selects both saved and recovered PDFs. Both helpers exit after
completion and Stop.
During a running vips command, recorded pointer activation changed Stop to
disabled “Stopping…” within 184 ms. Live fallback on a host without native
form capability remains unverified.

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
