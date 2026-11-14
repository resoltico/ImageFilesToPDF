# Image Files to PDF

A Finder Quick Action for macOS that turns images into PDFs, one image on each
page: one PDF for the whole selection, or one PDF per image. Images are centered
without cropping or enlargement, and originals are never modified. The same script
also runs from the command line, with a JSON settings file and a JSON receipt; see
[HEADLESS.md](HEADLESS.md).

Source and releases: https://github.com/resoltico/ImageFilesToPDF

## Requirements

- macOS 12.3 or later, with Shortcuts.
- `vips` (which includes `vipsheader`) and stable `pdfcpu` 0.16.4 or later,
  installed with Homebrew:

```sh
brew install vips pdfcpu
```

To upgrade pdfcpu, run `brew update` and then `brew upgrade pdfcpu`. The Quick
Action is one standalone JavaScript for Automation (JXA) file. Node.js and npm are
needed only for development.

## Install in Shortcuts

1. Download `Image-Files-to-PDF.jxa` from a
   [release](https://github.com/resoltico/ImageFilesToPDF/releases), or use
   `dist/Image-Files-to-PDF.jxa` from a source checkout.
2. In Shortcuts, create a shortcut and enable **Use as Quick Action → Finder**
   in its details. Configure it to receive **Files** from Finder.
3. Add **Run JavaScript for Mac Automation** and replace its example code with
   the complete JXA file.
4. Name the shortcut **Image Files to PDF**.

To install a newer build, replace the entire pasted script.
[INSTALL.txt](INSTALL.txt) has plain-text steps for verifying a download,
installing and removing the action.

## Use it

1. Select images or folders in Finder and run **Image Files to PDF**. Run
   without files, for example from the menu bar, it uses Finder's current
   selection.
2. If some selected items cannot be included, a review lists each one with its
   reason and folder; choose **Continue** or **Cancel**.
3. Choose the settings and click **Create**. The note above the controls says
   how many PDFs and pages will be made and where they will be saved. If a
   setting is wrong, every problem is listed at once and your draft is kept.
4. A progress panel shows the current image. **Stop** takes effect at the next
   safe point and keeps every PDF already saved.
5. Completion lists what was saved, where, and anything that failed.
   **Show in Finder** reveals every saved or recovered PDF; **Details** shows
   technical diagnostics and **Back** returns to the summary.

Confirmed settings are remembered for the next run in the preferences domain
`com.resoltico.ImageFilesToPDF`, shared by every installed copy of the action. To
reset them:

```sh
defaults delete com.resoltico.ImageFilesToPDF
```

## Settings

| Field | Setting | Values | Default |
| --- | --- | --- | --- |
| `mode` | PDF files | `combined`: one PDF, one image per page; `separate`: one PDF per image | `combined` |
| `paperSize` | Paper size | `A4` (595.28 × 841.89 pt) or `Letter` (US Letter, 612 × 792 pt) | `A4` |
| `orientation` | Orientation | `Portrait` or `Landscape` | `Portrait` |
| `resolutionLimit` | Maximum resolution | 72–1017 ppi | 300 |
| `quality` | JPEG quality | 1–100; used only when an image is re-encoded as JPEG | 82 |
| `background` | Page background | `#RRGGBB`; presets White, Black, Purple `#8E79E0`, Dark blue `#204486` | `#FFFFFF` |

Each image is placed at one pixel per point and scaled down to fit the page,
never up. Maximum resolution caps the pixel density an image is stored at; a
larger image is downsampled, a smaller one is left as it is. The page background
fills the margins and any transparent pixels; it does not recolor opaque image
content. A typed background color may use either case and an optional `#`.

## Images and PDFs

Supported formats are JPEG, PNG, HEIC/HEIF, TIFF, WebP and AVIF, with a matching
filename extension. The content must be a single still image that the installed
vips can decode. Animated and multi-image files, vectors, documents, camera RAW,
empty files and damaged images are refused, with the reason. JPEG decoder
warnings count as damage. HDR JPEG photos are
converted as standard-range images, without their gain maps.

Selected folders are searched recursively. The search skips hidden entries,
packages, links and unsupported names, and reports entries it cannot read. A
hidden image selected directly is included; a selected link or package is
refused. Overlapping selections, differently cased spellings and hard links are
converted once. Pages follow the full path in natural order, so `2` comes before
`10`, whatever order the items were selected in.

A PDF made from images found in a selected folder is saved in that folder; one
made from an image selected directly is saved beside it. A combined PDF goes where
the first image's PDF would go. When exactly one image can be included, either
mode names the PDF after it, as in `photo.pdf`, with no date-time suffix. A combined
PDF of two or more images is named `Images YYYY-MM-DD at HH.MM.SS.pdf` in local
time. Separate PDFs take their images' names. Two images whose names would clash
in the same folder add their extension, as in `photo-jpg.pdf` and `photo-png.pdf`. An existing name gets a
number, as in `photo 2.pdf`; nothing is ever overwritten.

A standard-range RGB JPEG without an embedded color profile, upright, and no
larger than the maximum resolution allows is embedded unchanged. Other images are rotated upright,
converted from their color profile to sRGB (untagged grayscale stays grayscale),
flattened onto the page background where transparent, and downsampled where
needed. PNG and TIFF are then stored losslessly; JPEG, HEIC/HEIF, WebP and AVIF
are re-encoded as JPEG at the JPEG quality setting. A combined PDF is saved only
if every image converts; in separate mode, an image that fails does not stop the
others.

## Privacy and safety

**A JPEG embedded unchanged keeps its metadata**, including any location or
camera details, inside the PDF. Re-encoded images carry no metadata into the PDF.

Image Files to PDF reads only the images you select, works in a private temporary
folder, and never opens an original for writing. Nothing is sent over the network.
If a PDF cannot be saved where it belongs, it is saved to Downloads under its
intended name, or failing that to a checked temporary copy, and completion shows
where. [SECURITY.md](SECURITY.md) describes the file-safety rules in full.

## Command line

```sh
osascript -l JavaScript Image-Files-to-PDF.jxa -- --headless settings.json photo.jpg folder
```

Command-line runs open no dialogs and do not use remembered settings.
[HEADLESS.md](HEADLESS.md) specifies the settings file, the JSON receipt and the
exit statuses.

## Verify a download

Each release carries a checksum manifest and GitHub build attestations. From the
download folder, with GitHub CLI installed:

```sh
gh attestation verify Image-Files-to-PDF.jxa --repo resoltico/ImageFilesToPDF
shasum --check SHA256SUMS
```

The checksum verifies the downloaded file, not a copy pasted into Shortcuts. The
script's header and completion details state its version.

## Development and license

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, source layout and releases.
[QA.md](QA.md) defines the verification requirements and their limits.
[SECURITY.md](SECURITY.md) describes the trust boundaries and private reporting.

Image Files to PDF is licensed under the [GNU Affero General Public License, version 3
only](LICENSE) (`AGPL-3.0-only`). You may use it, including commercially, and copy,
modify and share it under those terms; it comes without any warranty. If you
distribute the script or a modified version, keep its notices and make the
corresponding source available as the license requires; the generated JXA names
the source for its version. Dependencies keep their own licenses. A separate
commercial licensing route is intended but not yet offered; see
[LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md).
