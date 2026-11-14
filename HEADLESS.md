# Command line

Image Files to PDF runs from the command line with `osascript`. Node is not needed.

```sh
osascript -l JavaScript Image-Files-to-PDF.jxa -- --help
osascript -l JavaScript Image-Files-to-PDF.jxa -- --version
osascript -l JavaScript Image-Files-to-PDF.jxa -- --headless settings.json photo.jpg folder
```

`--help` lists every setting in the table order below with its values and default; `--version` prints
`Image Files to PDF <version>`. Both print to stdout and exit 0. Anything else that
is not a complete `--headless` request is a usage error: it names the problem in one
sentence (`No arguments were given.`, `Unknown option: <arg>.`,
`--headless needs a settings file and at least one path.`, `An argument is empty.`
or `--help and --version take no other arguments.`), prints the run line and exits 2.

A command-line run never opens a dialog and neither reads nor writes remembered
settings. Paths may be absolute or relative to the working directory. Local
`file://` URLs are accepted; remote URLs are refused. Selection, conversion,
validation, saving and recovery follow the same rules as the Quick Action.

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

Every handled request writes one JSON object, ending in a newline, to stdout, and a
plain-language report to stderr. Read both the receipt and the exit status.

| Exit | Meaning |
| --- | --- |
| `0` | Complete |
| `1` | Incomplete or stopped; confirmed PDFs are kept |
| `2` | Usage error or invalid settings |
| `3` | A required tool is missing or unusable |

```json
{"state":"complete","documents":[{"state":"saved","sources":["/Users/me/Pictures/photo.png"],"pages":1,"issues":[],"output":"/Users/me/Pictures/photo.pdf"}],"rejected":[],"issues":[],"diagnostics":[],"elapsed":"1 second"}
```

| Field | Meaning |
| --- | --- |
| `state` | `complete`, `incomplete`, `canceled` or `invalid` |
| `documents` | One record per planned PDF, in order |
| `rejected` | Selected items that were not admitted |
| `issues` | Problems affecting the request as a whole |
| `diagnostics` | Optional-surface and cleanup diagnostics, such as retained workspaces |
| `elapsed` | Human-readable processing time, from the first image's preparation to completion; excludes dialogs and is absent before processing |

`complete` requires every PDF saved, nothing rejected and no issues. A request
refused before any work is `invalid`. Invalid usage/settings exit 2; an expected
tool-setup refusal is also `invalid` and exits 3 with the headline
"A required tool is missing or unusable." A stop that leaves work undone is `canceled`;
a stop that arrives after everything was saved does not erase the saved PDFs. An
abrupt process end, an external kill or a failed stdout cannot guarantee a receipt.

The stderr report is the headline, then sections separated by one blank line.
`Could not convert:` lists failed PDFs only. `Saved elsewhere:` lists each actual
recovery path with a one-line cause. `Other issues:` keeps run-level or cleanup
problems separate from failed conversions. Its
counts line lists only non-zero counts, as in `1 saved; 1 not included.`, and is
left out when all are zero. `Elapsed: …` is the last section when known. An
invalid request reports `The request is invalid.` and each problem.

## Document records

Each record has `state`, `sources` (the full paths of its images, in page order),
`pages` and `issues`.

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
`name`. An issue may also carry `field`, `source` and `diagnostic`; commands,
native errors and stacks appear only in `diagnostic`. An `unsupported-content`
refusal includes `diagnostic.loader`, the vips loader that recognized its content.
Settings diagnostics distinguish `missing: true` from `expectedType`/`actualType`
for wrong JSON types. CLI settings messages name the JSON key; form corrections
keep the setting's display name.

| Stage | Codes |
| --- | --- |
| `request` | `usage`, `settings-file`, `timestamp` |
| `settings` | `unknown`, `choice`, `integer`, `color`, `object` |
| `setup` | `operation` when a required tool or capability is missing or unusable |
| `selection` | `folder`, `unsupported-format`, `not-a-file`, `not-a-path`, `remote-url`, `not-a-folder`, `package`, `link`, `special-file`, `unreadable`, `unexaminable`, `empty-folder`, and the run issue `no-images` |
| `inspection` | `unreadable`, `empty`, `not-an-image`, `unsupported-content`, `multiple-images`, `damaged` |
| `allocation`, `planning`, `capture`, `preparation`, `execution`, `validation`, `publication`, `recovery`, `cleanup`, `workspace`, `reporting` | `operation`, `fault`, `canceled`, `damaged`, `publication`, `recovery`, `cleanup` |

When nothing is admitted, the run issue `no-images` says
`None of the selected items can be converted.` and the refused items are in
`rejected`. JPEG decoder warnings count as damage. Damage found only by a full
decode is `damaged` at the `preparation`
stage; a combined PDF with such an image is not saved, while separate mode saves
the others. Software faults (`fault`), cleanup failures and a stop end the run;
remaining PDFs are `not-started`. Confirmed PDFs are kept in every case.

## Names and saving

A PDF made from exactly one admitted image uses that image's sanitized name in
either mode: `photo.jpg` becomes `photo.pdf`, then `photo 2.pdf` if occupied.
A combined PDF of two or more admitted images is named
`Images YYYY-MM-DD at HH.MM.SS.pdf` from `timestamp`. Separate PDFs use the
image's sanitized name; images whose names would clash in one
destination add their lower-case extension. Clashes follow the destination's own
rules for case and Unicode normalization, and folder aliases are matched by native
identity. An existing name gets ` 2`, ` 3` and so on. If those facts cannot be
established, planning stops before any PDF is made rather than guessing.

A PDF that cannot be saved at its destination is saved to `~/Downloads` under its
intended name, or failing that to a confirmed copy in the system temporary
directory. Always use the receipt's actual `output` or `recovery` path. Retained
and unreadable workspaces are left in place and listed in `diagnostics`.

## Tool overrides

External tools run with `LC_ALL=C`, independently of the caller's locale.

`IMAGE_FILES_TO_PDF_VIPS`, `IMAGE_FILES_TO_PDF_VIPSHEADER` and
`IMAGE_FILES_TO_PDF_PDFCPU` may name explicit executables. An override that is
missing, relative or unusable fails setup with exit status 3; another executable is
never substituted. Override errors identify the variable and its value; fix or
unset that override rather than installing a different automatic tool. Setup checks
all three commands, including a real width read by `vipsheader` from a built-in PNG.
