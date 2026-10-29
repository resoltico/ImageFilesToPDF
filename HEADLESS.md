# Headless automation

Run the standalone JXA with an absolute settings-file path and at least one
local image or folder path. Local `file://` URLs are also accepted; remote URLs
are refused.

```sh
osascript -l JavaScript dist/Image-Files-to-PDF.jxa -- --headless /absolute/config.json /absolute/image.png
```

Headless mode uses no settings, consent or completion dialogs and does not read
or write interactive preferences. Selection, conversion, validation, publication
and recovery use the same application rules as the Quick Action.

## Request

The JSON root must be an object. All six page settings are required:

```json
{"paperSize":"A4","orientation":"Portrait","mode":"single","dpi":300,"quality":92,"background":"#FFFFFF"}
```

| Field | JSON type and allowed values |
| --- | --- |
| `paperSize` | String: `A4` or `Letter` |
| `orientation` | String: `Portrait` or `Landscape` |
| `mode` | String: `single` or `separate` |
| `dpi` | Number: integer 72–1017 |
| `quality` | Number: integer 1–100 |
| `background` | String: six hexadecimal digits, optional leading `#`, surrounding whitespace allowed |
| `timestamp` | Optional string shaped `YYYYMMDD_HHMMSS` |

Background is normalized to uppercase `#RRGGBB`, representing opaque sRGB.
Numeric strings, booleans, arrays and object coercion are not accepted. JSON
number `3e2` is 300; string `"3e2"` is invalid. Unknown fields and display labels
in place of canonical choice IDs are errors. All detected field issues are
returned together.

Omitting `timestamp` generates one in the host's local time. When supplied, it
must have exactly the stated shape; calendar validity is not checked. `null`,
`false`, numbers and empty strings are invalid. It is a run option, not a page
setting.

## Receipt and exit status

Every orderly handled run emits one JSON object on stdout. Complete requests
exit zero; incomplete requests and handled cancellation exit nonzero. Diagnostic
text goes to stderr. Read both the receipt and the exit status. Abrupt process
death, an external host stop or a failed stdout transport cannot guarantee a
receipt.

```json
{"state":"complete","documents":[{"state":"saved","sources":["/absolute/image.png"],"pages":1,"issues":[],"output":"/absolute/output_20261029_120000.pdf"}],"rejected":[],"issues":[],"diagnostics":[],"elapsed":"1 second"}
```

| Run field | Meaning |
| --- | --- |
| `state` | `complete`, `incomplete` or `cancelled` |
| `documents` | Ordered document outcomes and their source mappings |
| `rejected` | Selection refusals, with original path/name and reason |
| `issues` | Failures affecting the request as a whole |
| `diagnostics` | Optional-surface and cleanup diagnostics |
| `elapsed` | Human-readable elapsed time, when conversion reaches presentation |

`complete` requires every document saved, no refusals and no recorded document
or run issues. Handled failures or partial success are `incomplete`. An
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
