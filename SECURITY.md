# Security

## Reporting

This is a personal tool with no support commitment. Open an issue, or contact
the author directly if the problem should not be public first.

## What the tool does with your files

- Source images are read, never modified.
- Output PDFs are written beside the first selected image, and never overwrite
  an existing file: the name is suffixed until it is free, and publication is a
  non-clobbering `mv -n` followed by a re-check.
- Intermediates are held in a private `mktemp -d` directory and removed on
  success and on failure. The directory is checked against the expected
  `mktemp` shape before anything is removed recursively.
- Nothing is sent anywhere. The tool makes no network requests.

## Shell safety

Every external command is built as an argument vector and quoted through a
single function (`src/core/shell.js`), so a filename can never be interpreted
as shell syntax. That function rejects NUL bytes, and the unit tests execute
hostile filenames — quotes, `$HOME; touch NO`, newlines, globs — through
`/bin/sh` to confirm each argument survives as exactly one value.

The gate statically rejects `eval`, `new Function`, and any reintroduction of a
shell-interpolated command path.
