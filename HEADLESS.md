# Headless automation

Run the standalone JXA with a settings-file path and at least one local image
or folder path. Relative paths resolve against the process working directory. Local `file://` URLs are also accepted; remote URLs
are refused.

```sh
osascript -l JavaScript dist/Image-Files-to-PDF.jxa -- --headless /absolute/config.json /absolute/image.png
```

Headless mode uses no settings, consent or completion dialogs and does not read
or write interactive preferences. Selection, conversion, validation, publication
and recovery use the same application rules as the Quick Action.

## Request

The settings file is read natively as UTF-8 without a byte-order mark. Its JSON
root must be an object. All six page settings are required:

```json
{"paperSize":"A4","orientation":"Portrait","mode":"combined","resolutionLimit":300,"quality":92,"background":"#FFFFFF"}
```

| Field | Setting | JSON type and allowed values |
| --- | --- | --- |
| `paperSize` | Paper size | String: `A4` or `Letter` |
| `orientation` | Orientation | String: `Portrait` or `Landscape` |
| `mode` | PDF files | String: `combined` or `separate` |
| `resolutionLimit` | Maximum resolution | Number: integer 72–1017 ppi |
| `quality` | JPEG quality | Number: integer 1–100 |
| `background` | Page background | String: six hexadecimal digits, optional leading `#`, surrounding whitespace allowed |
| `timestamp` | Run timestamp | Optional string shaped `YYYYMMDD_HHMMSS` |

Background is normalized to uppercase `#RRGGBB`, representing opaque sRGB.
Numeric strings, booleans, arrays and object coercion are not accepted. JSON
number `3e2` is 300; string `"3e2"` is invalid. Unknown fields and display labels
in place of canonical choice IDs are errors. All detected field issues are
returned together. Duplicate JSON keys follow `JSON.parse`: the last value wins.

Omitting `timestamp` generates one in the host's local time. When supplied, it
must be a real local date-time in exactly the stated shape, validated by a date
round trip. `null`,
`false`, numbers and empty strings are invalid. It is a run option, not a page
setting.

## Receipt and exit status

Every orderly handled conversion request emits one JSON object on stdout and a
plain run summary on stderr. Diagnostics remain in the receipt. Read both the
receipt and the exit status:

| Exit | Meaning |
| --- | --- |
| `0` | Complete |
| `1` | Incomplete or handled cancellation |
| `2` | Usage or invalid request |
| `3` | Required-tool/setup failure |

`--help` prints usage and the settings schema; `--version` prints
`Image Files to PDF <version>`. Both exit zero without conversion. Unknown flags,
no arguments and missing operands print usage and exit `2`, with no dialog.
String argv always selects the CLI; only a Shortcuts envelope or applet input
selects the interactive path. Abrupt process
death, an external host stop or a failed stdout transport cannot guarantee a
receipt.

```json
{"state":"complete","documents":[{"state":"saved","sources":["/absolute/image.png"],"pages":1,"issues":[],"output":"/absolute/Images 2026-10-29 at 12.00.00.pdf"}],"rejected":[],"issues":[],"diagnostics":[],"elapsed":"1 second"}
```

| Run field | Meaning |
| --- | --- |
| `state` | `complete`, `incomplete`, `cancelled` or `invalid` |
| `documents` | Ordered document outcomes and their source mappings |
| `rejected` | Selection refusals, with original path/name and reason |
| `issues` | Failures affecting the request as a whole |
| `diagnostics` | Optional-surface and cleanup diagnostics |
| `elapsed` | Human-readable elapsed time, when conversion reaches presentation |

`complete` requires every document saved, no refusals and no recorded document
or run issues. Requests rejected before work are `invalid`. Handled failures
or partial success are `incomplete`. An
acknowledged stop that leaves work undone is `cancelled`. A late stop does not
invent omissions or erase confirmed saved outputs. Optional observer diagnostics
alone need not make an otherwise complete conversion incomplete.

## Document outcomes

Each document has `state`, `sources`, `pages` and `issues`:

| State | Meaning and location |
| --- | --- |
| `saved` | Confirmed publication; `output` is the actual chosen path |
| `recovered` | Validated PDF retained outside the requested publication; `recovery` names its location |
| `failed` | Document could not complete; inspect issues for details or an unconfirmed retained candidate |
| `cancelled` | Stopped without a confirmed save |
| `not-started` | Work left unattempted after the run stopped |

`pages` counts prepared pages, including preparation completed before a failing
batch handoff. It is not a saved-page count. Derive saved counts and paths from
`saved` records, and recovery counts from `recovered` records. A saved document
can carry a later fault while retaining its confirmed `output`.

Issues carry a code, stage and message, with source or field attribution where
applicable. Command/native-error/stack data is retained in diagnostic detail.
Unconfirmed candidates are identified in issues and must not be treated as
validated recoveries. Additional internal facts such as fatal-stop markers or
per-document observer diagnostics may be present.

## Backend overrides

`IMAGE_FILES_TO_PDF_VIPS`, `IMAGE_FILES_TO_PDF_VIPSHEADER` and
`IMAGE_FILES_TO_PDF_PDFCPU` select explicit executable paths. An invalid explicit
override fails setup with that path; it does not select another executable.
The executables must be trusted and support the required pipeline operations.

## Source inspection

After identity deduplication, admission checks file access, empty files, the
actual loader, image count and dimensions before conversion. Refusals in
`rejected` use `unreadable`, `empty`, `not-an-image`, `unsupported-content`,
`multiple-images` or `damaged`, with the original path and a plain `reason`.
Backend text and commands belong to `diagnostic` only.

The captured copy is independently inspected and must match the admitted
identity, version and image facts. A source that changes after selection fails
its document. Damage that requires a full decode is a document failure with
code `damaged`; it can still fail a combined document after admission. No subset
of a failed combined document is published. Separate mode can save the other
valid documents.

## Names and retained work

Combined names use local time: `Images YYYY-MM-DD at HH.MM.SS.pdf`. Separate
names use sanitized stems; same-run stem conflicts in one destination add the
lower-case source extension. Conflicts follow the actual destination namespace,
including its case and normalization behavior; directory aliases use native
identity. Existing-entry collisions use ` 2`, ` 3`, etc. Unavailable comparison
facts stop planning before PDF encoding rather than guessing. This includes
Unicode conflicts on a foreign read-only volume when neither a temporary
namespace nor reliable persistent identifiers with hard-link support are available.

A failed destination first recovers a validated PDF to `~/Downloads` under its
intended name. If that cannot be written and confirmed, a confirmed temporary
copy is used. Always consume the receipt's actual `output` or `recovery` path.
A valid conversion startup reclaims dead-owner workspaces without retention
markers; help, version and invalid requests do not perform housekeeping.
Retained and unreadable workspaces are left in place and appear in diagnostics.
