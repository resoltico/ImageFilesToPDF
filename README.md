# Image Files to PDF — macOS

A Finder Quick Action that converts local images into PDFs, with one image on
each page. Choose one multi-page PDF or one single-page PDF per image. Images
are centred without cropping or enlargement; originals are never modified.

Source and releases: https://github.com/resoltico/ImageFilesToPDF

## Requirements

- macOS 12.3 or later, with Shortcuts.
- `vips`, `vipsheader` and stable pdfcpu 0.16.4 or later.

Install the runtime tools with Homebrew:

```sh
brew install vips pdfcpu
```

`vipsheader` comes with `vips`. To upgrade pdfcpu:

```sh
brew update
brew upgrade pdfcpu
```

The Quick Action runs one standalone JavaScript for Automation (JXA) file.
Node.js and npm are needed only for development. See [QA.md](QA.md) for the
compatibility assumptions and current live-host verification limits.

## Install in Shortcuts

1. Obtain `Image-Files-to-PDF.jxa` from a release, or use the repository copy
   at `dist/Image-Files-to-PDF.jxa`.
2. In Shortcuts, create a shortcut and enable **Use as Quick Action → Finder**
   in its details. Configure it to receive **Files** from Finder.
3. Add **Run JavaScript for Mac Automation** and replace its example code with
   the complete JXA file.
4. Name the shortcut **Image Files to PDF**.

Select files or folders in Finder and run the Quick Action. When Shortcuts
supplies no input, the interactive action uses Finder's current selection.
To install a changed build, replace the entire pasted script in the shortcut.

[INSTALL.txt](INSTALL.txt) contains plain-text installation and removal instructions.

## Supported images and selection

Supported filename extensions are `.jpg`, `.jpeg`, `.png`, `.heic`, `.heif`,
`.tif`, `.tiff`, `.webp` and `.avif`. The installed decoder must support the
format, and the actual content must be a supported single-image raster.
Animated PNG/WebP, multi-image containers, corrupt or indeterminate metadata,
and disguised SVG, PDF or RAW content are refused.

Selected folders are searched recursively. The walk skips hidden entries,
packages, links and unsupported filenames. Explicitly selected hidden images
are considered. Selected links and packages are refused; links are not followed.
Unreadable folders or entries are reported, without treating an incomplete
search as an empty folder.

Folder overlap, case aliases and hard links are deduplicated by file identity.
Explicit requests are checked for eligibility before deduplication, so a refused
alias does not suppress an eligible image. Ordering uses natural comparison of
full paths: `2` precedes `10`, independently of selection order.

Images discovered through a selected folder save into that selected folder,
including images found in its subfolders. Explicit files save beside their
source. A combined document uses the first ordered image's destination folder.

## Settings and output

| Field | Setting | Values | Default |
| --- | --- | --- | --- |
| `mode` | PDF files | `combined`: one PDF, one image per page; `separate`: one PDF per image | `combined` |
| `paperSize` | Paper size | A4 or US Letter | A4 |
| `orientation` | Orientation | Portrait or Landscape | Portrait |
| `resolutionLimit` | Maximum resolution | Integer 72–1017 ppi | 300 ppi |
| `quality` | JPEG quality | Integer 1–100 | 92 |
| `background` | Page background | Six hexadecimal sRGB digits, optional `#` | `#FFFFFF` |

The background presets are white, black, purple `#8E79E0` and dark blue
`#204486`. You can type a custom colour; spaces and letter case are normalized.
The opaque background fills margins and transparent pixels without recolouring
opaque image content. PNG and TIFF use lossless image encoding. Eligible JPEGs are embedded unchanged;
other JPEG, HEIC/HEIF, AVIF and WebP images use JPEG encoding, including lossless WebP.

Selection refusals are shown before conversion. The settings form shows the
candidate count and destinations, preserves draft answers during correction,
and reports all detected field errors together. Variable detail is selectable
and scrollable. When the native form capability is unavailable, stepwise dialogs
use the same validation and end with a confirmation. Coding faults are diagnosed.

Confirmed interactive settings are remembered under
`com.resoltico.ImageFilesToPDF`, shared by all installed copies of this action.
Invalid stored records use the defaults. Headless runs neither read nor write
these preferences. To reset them:

```sh
defaults delete com.resoltico.ImageFilesToPDF
```

A combined PDF is named `Images YYYY-MM-DD at HH.MM.SS.pdf` in local time.
Separate PDFs use `<sanitized stem>.pdf`. Sources sharing a stem and destination
in the same run include their lower-case extension, for example `photo-jpg.pdf`
and `photo-png.pdf`. Existing-entry collisions use `photo 2.pdf`, `photo 3.pdf`,
and so on. Existing files, directories, pipes and links are never overwritten.

Combined mode publishes no subset if a candidate fails. Separate mode continues
ordinary document failures; cancellation, cleanup failures and software faults
can stop remaining work. Completion distinguishes saved, recovered, failed,
cancelled and not-started documents and includes full relevant paths.

## Processing and recovery

Candidates are inspected before settings: unreadable, empty, unsupported and
multi-image files are refused with their original paths. Batched header reads
keep selection checking bounded. Damage requiring a full decode can still fail
during conversion.

Each admitted source is copied into a private workspace. The same
owned bytes are inspected and decoded, with identity/version checks around
capture. Observed changes or unreadable required facts cause refusal. Coarse
filesystem timestamps cannot guarantee an atomic snapshot of a concurrently
modified original.

Images are embedded at image size on a vector page background. Natural size is
one source pixel per point, scaled down to fit without enlargement. Maximum
resolution is a downsampling ceiling, not a page raster size. Paper dimensions
are A4 (595.2756 × 841.8898 pt) or US Letter (612 × 792 pt).

An untagged three-band sRGB JPEG with upright orientation and density within
the ceiling is embedded byte for byte after a full decode check. Its embedded
metadata is retained. Other images are oriented, converted from embedded profiles
to sRGB and flattened onto the page background as needed. Untagged one-band grey
stays grey. PNG/TIFF use lossless PNG; JPEG/HEIF/WebP use the JPEG quality setting
when re-encoded. Lossless WebP is also re-encoded as JPEG. Images are never
upsampled.

Pages are imported in batches bounded by 32 queued pages, 64 MiB of encoded
page data and command length. One newly prepared page may temporarily coexist
with the queue; an oversized page is imported alone before another source is
prepared. Consecutive pages sharing a placement are imported together; bounded
merge levels assemble the document with bookmarks disabled. Exact page count
and strict PDF validation are required before saving. pdfcpu runs with `--conf disable`, without personal configuration, fonts or
certificates.

Publication uses exact-path native hard links or exclusive rename of an owned
destination copy. Identity and size must confirm the actual final path before
ownership is released. APFS and HFS+ support the link route; FAT32 supports the
exclusive-rename route. exFAT cannot provide the required publication primitive,
so saving there fails with recovery instead of exposing a partial final file.

A validated PDF that cannot be saved is published to `~/Downloads` under its
intended filename, using the same collision and native confirmation rules. If
Downloads cannot be written and confirmed, a checked copy in the system temporary
directory is used. The actual location appears in completion, with Show in Finder.
If neither recovery can be confirmed, the original workspace is retained. An unexpected validation fault
can retain an explicitly unconfirmed candidate; it is not counted as a validated
recovery. Follow the reported path and status when recovering work.

Stop requests are checked at safe boundaries. Confirmed outputs remain saved,
including when a stop arrives during publication. The interactive action has one progress panel with Stop; it hides for questions
and closes before completion. Observer faults are diagnostic rather than a loss
of saved work. Workspaces record PID and process start time before user data.
The next valid conversion reclaims dead-owner workspaces without a retention
marker; retained or unreadable workspaces are reported and left untouched.

## Headless request and receipt

Use `osascript` with a strict JSON settings file for automation. The complete
request, receipt and exit-status contract is in [HEADLESS.md](HEADLESS.md).

## Verify a download

The release workflow attests the JXA, checksum manifest, installation instructions
and license. From the download directory, with GitHub CLI installed:

```sh
gh attestation verify "Image-Files-to-PDF.jxa" --repo resoltico/ImageFilesToPDF
shasum --check SHA256SUMS
```

An attestation identifies the workflow and source commit. A checksum verifies
the downloaded JXA bytes; it does not verify a copy pasted into Shortcuts.
The script header and completion details identify its declared version.

## Development and license

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, source boundaries and release
operation. [QA.md](QA.md) defines verification requirements and limits.
[SECURITY.md](SECURITY.md) describes trust and file-safety boundaries.

First-party files use [Mozilla Public License 2.0](LICENSE) (`MPL-2.0`).
Preserve license/source notices and provide covered source as required by that
license when distributing covered files or modifications. Dependencies retain
their own licenses. The generated JXA carries the MPL and corresponding-source
notices; releases include the complete `LICENSE`.
