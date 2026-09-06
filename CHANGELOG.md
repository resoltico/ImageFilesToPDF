# Changelog

Notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-09-06

### Added

- Files that will not be converted are now listed by name, each with its
  reason: an unsupported format, or a file that cannot be read. Selecting two
  photos and an animated GIF used to produce a PDF of the photos and a report
  that nothing had failed, and selecting only unsupported files used to say
  "No images selected" to someone who had selected several.
- A finished PDF that cannot be saved into the output folder is now kept in a
  recovery folder, and the message says exactly where it is. It used to be
  deleted, so a naming clash at the last step destroyed the converted pages.
- Headless runs write a receipt to standard output saying what was produced,
  what failed, and what was not converted.

### Changed

- The completion message names every folder that received a PDF. With separate
  output each PDF is written beside its own image, so a selection spanning two
  folders produced PDFs in two folders while the message named only one.
- The failure count in the completion message now includes files that were
  refused before conversion, not only files that failed during it.
- A headless run that did not convert everything asked for now exits with a
  failure, with the receipt still on standard output. Any run that produced at
  least one PDF used to exit successfully, however much had been dropped.
- Failure messages in headless output now include the command that failed,
  which previously went missing as the error was passed outward.

### Fixed

- An image now covers the same area of the page at every resolution. The same
  photograph filled about 102 mm across at 300 DPI and about 51 mm at 600,
  because the page was measured in pixels rather than on paper; picking a
  higher resolution for quality quietly shrank the picture.
- A file whose page count cannot be established is now refused rather than
  treated as a single page. The check that refuses multi-page TIFF, HEIC and
  AVIF files could be walked straight past by any file the reader could not
  open, and only the first page would have reached the PDF.
- The settings form's timeout is cancelled when the form is answered. It stayed
  armed for two minutes and then dismissed whichever form happened to be open —
  the form redisplayed after correcting a value, or the next run's.

## [1.0.0] - 2026-09-06

- First release.
