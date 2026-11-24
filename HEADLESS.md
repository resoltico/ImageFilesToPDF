# Command line

Run the standalone Node.js distribution with Node 26.13.1 or later, libvips
(`vips` and `vipsheader`), and stable pdfcpu 0.16.4 or later. For macOS,
`brew install vips pdfcpu` installs the native tools. On Linux, use a build of
libvips with the image codecs you need and an official pdfcpu release for your
architecture. On Windows, extract the libvips **all** distribution and pdfcpu
for your Windows architecture or supported emulation. Put the directories
containing the actual executables on `PATH`. Windows PowerShell 5.1 is used
internally to query filesystem and process properties on Windows.

See [the platform matrix](QA.md#native-platform-matrix) for tested combinations
and open qualification checks. The CLI delivers one platform-independent CJS
file. [Finder installation](INSTALL.txt) uses the standalone JXA file.

## Run syntax

In Bash, zsh, or PowerShell, quote paths containing spaces. The first
`--` after the settings operand is required. Source names beginning with a
dash go after it, where they are passed literally.

```sh
node ./Image-Files-to-PDF.cjs --help
node ./Image-Files-to-PDF.cjs --version
node ./Image-Files-to-PDF.cjs --settings 'page settings.json' -- 'my photo.jpg' '-album'
```

```powershell
& node .\Image-Files-to-PDF.cjs --settings 'page settings.json' -- 'C:\Photos\my photo.jpg' '-album' > receipt.json
$status = $LASTEXITCODE
$receipt = Get-Content -Encoding utf8 -Raw -LiteralPath receipt.json | ConvertFrom-Json
```

Use PowerShell 7.4 or later for native stdout redirection as bytes. Bash
redirection with `> receipt.json` also preserves the UTF-8 bytes. Capture the
machine exit status immediately with `$LASTEXITCODE` or `$?`, respectively.

Help lists the required settings, allowed values and a complete example.
Version prints `Image Files to PDF <version>`. Both write ordinary text to
stdout. An invalid command yields one usage issue, a run line and a help hint.
Help, version and invalid requests have no conversion-side effects, including
workspace reclamation.

A command-line run is headless and leaves remembered Finder settings alone.
Relative paths resolve from the current working directory. Local file URLs
accept empty or `localhost` authority. Windows accepts drive-absolute paths
such as `C:\Photos\a.jpg` and ordinary relative paths. Receipts use forward
slashes in Windows paths and preserve actual basenames. Drive-relative and
root-relative Windows paths, UNC shares, device namespaces, alternate data
streams and names with trailing dots or spaces are refused. On all platforms,
use a local filesystem and names that round-trip through the tools as Unicode.

## Settings file

The settings operand accepts a local `file://` URL (empty or `localhost` authority), including percent-encoded spaces and Unicode. Remote or malformed settings URLs are refused before reading the file.

The settings file is UTF-8 JSON without a byte-order mark, and its root is an
object. All six page settings are required; unknown fields, display captions in
place of values, numeric strings, fractional numbers, `null` and wrong types are
refused, and every problem is reported together. JSON number `3e2` is 300; the
string `"3e2"` is refused. Duplicate keys follow `JSON.parse`: the last value wins.

```json
{
  "mode": "combined",
  "paperSize": "A4",
  "orientation": "Portrait",
  "resolutionLimit": 300,
  "quality": 82,
  "background": "#FFFFFF"
}
```

| Field | Setting | JSON value |
| --- | --- | --- |
| `mode` | PDF files | `combined` or `separate` |
| `paperSize` | Paper size | `A4` or `Letter` |
| `orientation` | Orientation | `Portrait` or `Landscape` |
| `resolutionLimit` | Maximum resolution | Integer 72–1017 (ppi) |
| `quality` | JPEG quality | Integer 1–100 |
| `background` | Page background | Six hexadecimal digits, optional `#`, surrounding whitespace allowed; normalized to uppercase `#RRGGBB` |
| `timestamp` | Run timestamp | Optional `YYYYMMDD_HHMMSS` |

`timestamp` is a run option, not a page setting: it names a combined PDF of two
or more admitted images and defaults to the current local time. It stays accepted
and is unused for separate PDFs and for a combined PDF with one admitted image.
When present it must be a real local date and time in exactly that shape; `null`, `false`, numbers and empty strings are refused.

## Receipt and exit status

A handled request attempts its plain-language stderr report before one JSON
receipt on stdout, ending in a newline. Read both the receipt and the exit status.
A transport failure exits nonzero even when a complete processing receipt was
delivered; it does not remove confirmed PDFs or change their processing state.
With working stderr, failed stdout completion adds one plain line:
`Standard output could not be completed.` If stderr fails, the JSON receipt is
still attempted. Node can reopen a descriptor the parent passed closed as a
writable null sink. In that case the shell receives no receipt bytes and a
successful conversion can still exit 0.

| Exit | Meaning |
| --- | --- |
| `0` | Complete |
| `1` | Incomplete, stopped or report/receipt transport failed; confirmed PDFs are kept |
| `2` | Usage error or invalid settings |
| `3` | Setup failed: a required tool/capability is unusable, or an unexpected setup fault occurred |

```json
{"state":"complete","documents":[{"state":"saved","sources":["/Users/me/Pictures/photo.png"],"pages":1,"issues":[],"output":"/Users/me/Pictures/photo.pdf"}],"rejected":[],"issues":[],"diagnostics":[],"elapsed":"1 second"}
```

| Field | Meaning |
| --- | --- |
| `state` | `complete`, `incomplete`, `canceled`, `invalid-request` or `setup-failed` |
| `documents` | One record per planned PDF, in order |
| `rejected` | Selected items that were not admitted |
| `issues` | Problems affecting the request as a whole |
| `diagnostics` | Optional-surface and cleanup diagnostics, such as retained workspaces |
| `elapsed` | Human-readable batch processing time, including output planning, through completion; excludes tool setup, source inspection and dialogs, and is absent before processing |

`complete` requires every PDF saved, nothing rejected and no issues.
Usage errors and rejected settings have state `invalid-request` and exit 2.
Setup failures have state `setup-failed` and exit 3. A canceled run exits 1,
including a stop during setup. A stop that leaves work undone is `canceled`;
a stop that arrives after everything was saved does not erase the saved PDFs. An
abrupt process end, `SIGKILL` or a failed stdout cannot guarantee a receipt.

On macOS and Linux, `SIGINT` and `SIGTERM` request cooperative Stop. On Windows, use Ctrl+C in a PowerShell console. PowerShell can close its redirected pipeline when it handles Ctrl+C. A
receipt on cancellation requires writable streams. The Windows verification
launches the foreground console process with direct file redirection to
observe its receipt and exit code. Forced process termination is abrupt. A running native command finishes before the next safe checkpoint observes the request; publication and recovery protections remain in force. Signal monitoring stays active through receipt transport. Normal process exit lets the OS reclaim its resources.

The stderr report is the headline, then sections separated by one blank line.
Output and recovery basenames are read back as literal directory-entry names after identity and size confirmation; chosen parent-folder spelling is preserved. If a claim's name cannot be verified, a verified workspace PDF stays in place and the issue reports that uncertainty rather than guessing a public output path. If that workspace PDF cannot be verified either, the PDF is failed with a fatal issue and no recovery path; existing files remain untouched. The destination folder needs read/search access for this verification. An unavailable or ambiguous directory listing reports the same claim uncertainty and preserves existing files; a canonicalized path is not used as a guessed stored name.

`Could not convert:` lists failed PDFs only. `Saved elsewhere:` lists each actual
recovery path with a one-line cause. `Other issues:` keeps run-level or cleanup
problems separate from failed conversions. `Temporary work:` names actual retained, unreadable or reclaimed workspaces when startup finds them; ordinary runs omit it. Its
counts line lists only non-zero counts, as in `1 saved; 1 not included.`, and is
left out when all are zero. `Elapsed: …` ends the processing report when known; a transport-failure line can follow. An
invalid request reports `The request is invalid.` and each problem.

## Document records

Each record has `state`, `sources` (the full paths of its images, in page order),
`pages` and `issues`. Optional `fatal: true` means a software fault or mandatory
cleanup failure ended further documents;
optional `diagnostics` holds technical observer diagnostics.

| State | Meaning |
| --- | --- |
| `saved` | Saved; `output` is the PDF's full path |
| `recovered` | Validated but saved somewhere else; `recovery` is the actual location |
| `failed` | Not saved; `issues` explain |
| `canceled` | Stop interrupted this PDF before it was saved |
| `not-started` | An earlier stop or fault ended the run first |

`pages` counts prepared pages, not saved pages; take saved counts and paths from
`saved` records and recovery locations from `recovered` records. A saved record can
carry a later fault while keeping its `output`. A candidate whose validation
faulted is identified in `issues` and is not a validated recovery.

## Issue codes

A missing file or folder is `not-a-path` before format filtering; permission
failures remain `unreadable` or `unexaminable`. Non-local URI schemes and remote
`file://` authorities are `remote-url`; download those items first. For a relative
filename that looks like a URI scheme, such as `photo:one.jpg`, use `./photo:one.jpg`.

Every issue and every `rejected` entry carries a `code`, a `stage` and a message:
`message` for issues, `reason` for rejected entries, which also carry `path` and
`name`. An issue carries named message parameters in `params` and may include `field`,
`source` and `diagnostic`. Commands and native errors appear in `diagnostic`. Receipts omit every structured `stack` key,
including nested diagnostic objects; user text containing the word “stack” is
unchanged. Technical diagnostic records carry `code` and `message`, with optional
`stage` and varying JSON details. An `unsupported-content`
refusal includes `diagnostic.loader`, the vips loader that recognized its content, including excluded SVG and PDF content. Truncated HEIC recognized by its decoder is `damaged`; unrecognized bytes remain `not-an-image`. Visible pipes, sockets and devices inside selected folders are `special-file`; hidden entries and links remain skipped.
Settings diagnostics distinguish `missing: true` from `expectedType`/`actualType`
for wrong JSON types. CLI settings messages name the JSON key; form corrections
keep the setting's display name.

| Stage | Codes |
| --- | --- |
| `request` | `usage`, `settings-file`, `timestamp` |
| `settings` | `unknown`, `choice`, `integer`, `color`; `object` belongs to the core validator, not the CLI root check |
| `setup` | `operation` when a required tool or capability is missing or unusable |
| `selection` | `folder`, `unsupported-format`, `not-a-file`, `not-a-path`, `remote-url`, `not-a-folder`, `package`, `link`, `special-file`, `unreadable`, `unexaminable`, `empty-folder`, and the run issue `no-images` |
| `inspection` | `unreadable`, `unexaminable`, `empty`, `not-an-image`, `unsupported-content`, `multiple-images`, `damaged` |
| `allocation`, `planning`, `capture`, `preparation`, `execution`, `validation`, `publication`, `recovery`, `cleanup`, `workspace`, `reporting` | `operation`, `fault`, `canceled`, `damaged`, `publication`, `recovery`, `cleanup` |

A CLI settings root that is an array, `null` or another non-object is
`settings-file` at `request`, with exit 2. The core `object` validation code is
reserved for callers of the core settings validator.

When nothing is admitted, the run issue `no-images` says
`None of the selected items can be converted.` and the refused items are in
`rejected`. JPEG decoder warnings count as damage. Damage found only by a full
decode is `damaged` at the `preparation`
stage; a combined PDF with such an image is not saved, while separate mode saves
the others. Software faults (`fault`), mandatory cleanup failures (including name-inspection cleanup combined with another failure) and a stop end the run;
remaining PDFs are `not-started`. Confirmed PDFs are kept in every case.

## Names and saving

A PDF made from exactly one admitted image uses that image's sanitized name in
either mode: `photo.jpg` becomes `photo.pdf`, then `photo 2.pdf` if occupied.
A combined PDF of two or more admitted images is named
`Images YYYY-MM-DD at HH.MM.SS.pdf` from `timestamp`. Separate PDFs use the
image's sanitized name; images whose names would clash in one
destination add their lower-case extension when their extensions differ. Two
images named `inner.png` produce `inner.pdf` and `inner 2.pdf`. Clashes follow the destination's own
rules for case and Unicode normalization, and folder aliases are matched by native
identity. An existing name gets ` 2`, ` 3` and so on. If those facts cannot be
established, planning stops before any PDF is made rather than guessing.

For an image-derived PDF name, the sanitized stem is shortened on a UTF-8 code
point boundary as needed. The requested basename, including `.pdf` and any
disambiguating source-extension suffix, uses at most 250 UTF-8 bytes before a
collision number: five of the 255-byte budget are reserved for ` 9999`. Stored
spelling can reflect filesystem normalization; use the actual receipt path.

Recovery first attempts the intended name under `~/Downloads`. If it cannot confirm a recovery there, it keeps and verifies the private workspace PDF. A claim with uncertain acknowledgement or identity leaves the existing entry and the verified original in place. Recovery
is reported only when its path and contents are verified; otherwise the report
identifies retained work or unresolved uncertainty. Always use the receipt's
actual `output` or `recovery` path. Retained
and unreadable workspaces are left in place and listed in `diagnostics` and the
human report. Successful safe startup reclamation uses diagnostic code
`workspace-reclaimed`, stage `workspace`, and the exact workspace path in
`diagnostic.path`; these notes do not change run state.

## Tool overrides

Native commands launch directly with arguments and `LC_ALL=C`, from their own
executable directories. Executable
lookup uses absolute `PATH` directories in order. Windows uses `.exe` files.
The built-in capability probe includes a Unicode-named PNG. Some libvips builds omit optional codecs. The pinned
Windows `all` distribution includes AVIF decoding and omits HEVC. HEIC photos
need a libvips build with an HEVC decoder. Linux Ultra HDR also requires a build
with the corresponding codec. [libvips Windows build variants](https://github.com/libvips/build-win64-mxe/tree/v8.18.7#heic-support) The CLI checks PNG/APNG structure to detect additional
images, including an APNG with a separate default image. Malformed or
unverifiable image-count metadata is refused.

Only positively identified name collisions produce a numeric suffix. The CLI
uses a hard-link claim, staging beside the destination for cross-volume copies.
When no exclusive route is available, it attempts recovery. Separate-mode name
equivalence for multiple images in one folder needs permission to create an
owned comparison directory there. The Finder action also supports the macOS
exclusive-rename route described in [QA.md](QA.md).

`IMAGE_FILES_TO_PDF_VIPS`, `IMAGE_FILES_TO_PDF_VIPSHEADER` and
`IMAGE_FILES_TO_PDF_PDFCPU` may name explicit executables. An override that is
missing, relative or unusable fails setup with exit status 3; another executable is
never substituted. Override errors identify the variable and its value; fix or
unset that override rather than installing a different automatic tool. Setup checks
all three commands, including a real width read by `vipsheader` from a built-in PNG.
