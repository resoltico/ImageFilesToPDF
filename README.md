# Image Files to PDF — macOS

A source-controlled macOS Finder Quick Action that converts selected images
into one combined PDF or separate PDFs by invoking the
system-installed `vips` and `pdfcpu` command-line tools.

The production artifact is one generated JavaScript for Automation (JXA) file
that is pasted into Shortcuts. Node.js is a development-only tool. It is not
used by the Quick Action.

Source, releases and build attestation: https://github.com/resoltico/ImageFilesToPDF

## Requirements

**macOS 12.3 or later.**

The bound comes from the delivery mechanism rather than the code: the Shortcuts
app arrived on the Mac in macOS 12 Monterey, and 12.3 is the point at which its
JavaScript engine supports everything this action uses.

The gate holds the artifact to that floor; `QA.md` describes how.

## Runtime installation

```sh
brew install vips pdfcpu
```

`vipsheader` is installed with `vips`.

## Install in Shortcuts

1. Open **Shortcuts** and create a new shortcut.
2. Enable **Use as Quick Action** and **Finder** in the shortcut details.
3. Configure it to receive **Files** from Finder.
4. Add **Run JavaScript for Mac Automation**.
5. Delete the example code.
6. Paste all of `dist/Image-Files-to-PDF.jxa`.
7. Save the shortcut as **Image Files to PDF**.

The script uses files supplied by Shortcuts. If it receives no explicit input,
it falls back to Finder's current selection.

## Selecting a folder

Selecting a folder converts the images inside it, through every subfolder.
Hidden items, application packages, links and files that are not images are
passed over without comment — a folder of documents does not produce a
complaint for every document. A folder that cannot be read is reported by
name, including a subfolder: the images found elsewhere are still converted,
and you are told which folder could not be opened rather than left to notice
that something is missing. A folder that holds no supported images is reported
too.

Selecting a folder and a file inside it does not convert that file twice, in
whichever order they are selected, and neither does selecting the same
photograph under two names: a Mac is case-insensitive as it comes, so
`A.jpg` and `a.jpg` are one file and are converted once. Every file you
select by hand is answered on its own terms — converted, or refused with a
reason — even when its folder is selected too, and even when another name for
the same file was refused. A symbolic link is refused rather than followed,
for the same reason a folder's images are not looked for beyond it. A hidden photograph you pick
out yourself is converted, though the walk passes over hidden files it finds
on its own, and a file that cannot be converted still says so. A package
selected directly — an application, a photo library — is refused rather than
opened, so nothing is ever written inside a bundle.

The PDF is written to the folder you selected: one combined PDF inside it, or
separate PDFs inside it, rather than scattered through the subfolders the
images came from. Images are ordered by their whole path, so each folder's
images stay together and in order.

Before anything is converted, the settings window says how many images were
found. Selecting a folder can mean a great many, and that number is there so
that Cancel is a decision rather than a guess.

## Supported images

JPEG, PNG, HEIC/HEIF, TIFF, WebP and AVIF — the still-image formats vips reads
that belong on a page. HEIC matters in particular: it is what an iPhone
produces, and those photos are Display P3, which the colour handling below
converts correctly.

`brew install vips` requires libheif, libtiff, webp and jpeg-xl, so these are
available on any machine that followed the installation above.

**Multi-page images are refused, not truncated.** vips reads the first page of
a multi-page TIFF, HEIC or AVIF unless asked for more, so a multi-page scan
would otherwise contribute one page and lose the rest silently. Such a file is
reported instead, naming the page count, so it can be split first. Verified
against vips 8.18.6; a later vips may change this, and the check reads the page
count rather than assuming it.

GIF, animated WebP, SVG, PDF and camera RAW are deliberately not accepted even
though vips can read them: only the first frame would be taken, an SVG would
land as a stamp because the pipeline never upscales, and RAW is a processing
job rather than a conversion.

## Current controls

- A4 or Letter page size
- portrait or landscape orientation
- DPI from 72 through 1041 — the ceiling is pdfcpu's 100-megapixel limit on an
  imported image, which A4 reaches at 1042 DPI, so it is derived from the
  largest paper size rather than chosen
- JPEG quality from 1 through 100
- one combined PDF or one PDF per image
- page background: white, black, purple `#8E79E0`, or dark blue `#204486`

All six are asked on one form, with the colours shown as swatches rather than
described in words and hex. A mistyped number is reported alongside every
other problem, with the answers already given left in place, so correcting it
does not mean answering the rest again.

The form is drawn with AppKit through the JXA ObjC bridge. That it displays
at all inside a Shortcuts action is measured rather than assumed: a probe run
inside `ShortcutsMacHelper` showed a real `NSAlert` with an accessory view
presenting and being answered, without raising the process activation policy
and so without a Dock icon appearing mid-action.

That is a fact about macOS 15.7, not a promise about the next one, so the
stepwise dialogs remain as a live fallback. If AppKit cannot be reached, or
the form cannot be presented, the action asks the same six questions one at a
time and works exactly as before.

## While it runs

The action reports what it is doing — which file it is preparing, and then
creating, validating and saving the PDF — through JavaScript for Automation's
own progress object.

Whether a Shortcut displays that is not something this project has been able to
measure, because a Shortcut cannot be created from the command line. The
reporting was chosen on that basis: writing to it cannot open a window, cannot
raise the process activation policy and put a Dock icon up mid-action, and
cannot pump a run loop underneath the host. If nothing is listening, nothing
happens. `QA.md` says how to find out.

## When the tools are missing

Nothing is asked of the user until the tools have been checked. A machine that
is missing something is told immediately, in one message naming every problem,
with the command that fixes it — rather than after the settings have been
filled in.

The check is a capability probe, not a presence check. Each tool is run with
the exact flags the pipeline uses, against a path that cannot exist: a build
that understands the flags fails on the missing file, one that does not fails
on the flag. That distinction matters, because pdfcpu changed how it parses
flags — an older build is installed, on PATH, and rejects `--mode=strict` on
every run with an error that points nowhere.

A version comparison would be the wrong instrument here: `--export-profile` is
a backward-compatible alias that current libvips no longer advertises but still
accepts, so what matters is whether this build takes the flags, not what it is
called.

## Processing contract

For every source image, the runtime:

1. reads the source's pixel dimensions, works out where it sits on the page,
   and fits it to that placement while converting to sRGB, in a single
   `vips thumbnail` stage;
2. flattens an alpha channel onto the chosen background when the decoded image
   has one;
3. centres the image on an exact page-sized canvas and saves a
   metadata-stripped JPEG page;
4. imports the page or ordered pages with `pdfcpu` using `sc:1 rel`, in
   groups when there are more pages than one command line can carry;
5. validates the temporary PDF in strict mode;
6. publishes the PDF without overwriting an existing path.

Publishing is all or nothing. Every name this action writes to is one it
takes first, in a single operation that either creates the name or leaves it
alone — so nothing half finished appears under the name of your document, and
an existing file is never replaced: not a file, not a folder, not a named
pipe, not even a link whose target is gone. When the finished PDF is on the
same drive as the folder it belongs in, which is the ordinary case, taking the
name *is* the whole publication and no other file of ours ever appears there.
Otherwise the PDF is copied into a hidden folder this action makes for itself
beside the destination and moved onto its final name in one step that refuses
a name already in use — including on a card formatted for cameras, which is
tested against real ones.

A few drives can do neither, exFAT being the one you are likely to meet: some
large camera cards are formatted that way. Saving to one of those stops rather
than working around it. Nothing is written to the drive, the message says the
drive cannot take the output name in one step, and the finished PDF is kept —
the message says where. Saving into any other folder, on any Mac-formatted
disk, is unaffected.

A saved PDF is checked for being the one that was made: the output path is
asked which file it holds, and only the file this run put there counts. Some
other file of the right shape is not evidence — another program's PDF is one
too. Until that check passes the finished PDF stays where it was built, and
this action removes only names it took itself, which it knows because taking
them is how it got them. If publication fails the PDF is kept somewhere it
will survive and the message says where it is.

The source images are never modified. Temporary work is held in a private
`mktemp` directory and removed on success or failure.

### Colour management

The resize stage passes `--export-profile=srgb`, which performs a real ICC
transform when the source carries an embedded profile. This matters for
ordinary files: macOS screenshots are Display P3, and cameras often tag Adobe
RGB. Converting with a bare `colourspace srgb` stage instead ignores the
embedded profile and silently shifts those colours — a pure red reproduces as
`206,48,36` rather than `224,16,16`.

### Scaling

Where an image sits on the page is decided in points, from the image's own
pixel dimensions, before any raster exists: one source pixel is one point, and
that natural size is scaled down to fit the page and never enlarged beyond it.
Upscaling invents pixels, and produces a blurry page and a much larger file.

Deciding it from the pixel canvas instead makes the resolution setting move the
picture. The same photograph covered 102 mm across at 300 DPI and 51 mm at 600,
because a higher resolution made the page a larger number of pixels while the
image stayed the same number of pixels. Measured after the change, one image
covers 210.3 × 140.4 mm at 150, 300 and 600 DPI alike.

### Page size

Pages are exactly ISO A4 (595.28 × 841.89 pt) or US Letter (612 × 792 pt) at
every DPI. Page dimensions are defined in points and the pixel canvas is
derived from them, so the published size never drifts with the DPI setting.

## Knowing which build is installed

A Shortcut holds a pasted copy of the artifact, which cannot be checked against
`dist/SHA256SUMS`. Two things identify it anyway: the completion dialog ends
with the version, and the pasted text opens with a header naming the version,
the repository it was built from, and the licence. Comments are stripped from
the artifact on build, so that header is the one thing in it that is prose.

## Verifying a download

Every file a release offers — the artifact, the checksum manifest and
`INSTALL.txt` — is signed with a GitHub build attestation, which records that
this repository's release workflow built it from a specific commit:

```sh
gh attestation verify "Image-Files-to-PDF.jxa" --repo resoltico/ImageFilesToPDF
shasum --check SHA256SUMS
```

The artifact is rebuilt on a clean runner during the release and required to
reproduce the committed bytes exactly, so what is signed is both built by CI
and identical to what is in the repository.

## Working on it

`CONTRIBUTING.md` covers the layout and the workflow. `QA.md` is the contract:
what the gate enforces, at what thresholds, and why each guard exists.

```sh
npm ci
npm run release
```

The released artifact has no dependencies of its own beyond `vips` and
`pdfcpu`. ESLint, Stryker and acorn — which the build uses to find what it
removes — are development dependencies, pinned to exact versions, and none of
them reaches the artifact.
