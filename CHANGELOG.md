# Changelog

Notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-09-07

### Added

- Selecting a folder converts the images inside it, through every subfolder.
  Hidden items, application packages, links and files that are not images are
  passed over without comment; a folder that cannot be read, or that holds no
  supported images, is reported. Selecting a folder and something inside it
  does not convert that file twice.
- The settings window says how many images were found before it asks anything,
  so choosing Cancel is a decision rather than a guess. Selecting a folder can
  mean a great many images, and this is the only point between the selection
  and the work where the run can be called off.
- The action reports what it is doing as it goes — which file it is preparing,
  and then creating, validating and saving the PDF. Whether a Shortcut
  displays this is not something this project has been able to measure; the
  reporting costs nothing when nothing is listening.

### Changed

- Images are ordered by their whole path rather than by name first, so a
  folder's images stay together and in order instead of interleaving with
  another folder's whenever the names happened to. Within a single folder the
  order is unchanged.
- A PDF is written to the folder that was selected. Selecting a folder used to
  put a combined PDF inside whichever subfolder sorted first, and separate PDFs
  beside each image wherever it was found.

### Fixed

- A combined PDF of more than about ten thousand images no longer fails with
  "An error occurred." Every page was named on one command line, and there is
  a limit to how long one of those can be; the pages are handed over in groups
  now, and the finished PDF is asked how many pages it ended up with.
- Selecting a folder is no longer reported as an unsupported image format —
  and a folder named something.png is no longer reported as unreadable.

## [1.1.1] - 2026-09-07

### Fixed

- A photograph taken in portrait is placed at its proper size. A phone stores
  such a photograph sideways with a note to turn it, and the note was read
  when the image was converted but not when its place on the page was worked
  out — so it arrived at a quarter of the area of the same photograph whose
  pixels were already upright. Measured: 101 × 200 points where 201 × 400 was
  intended.
- A finished PDF that cannot be saved is no longer deleted along with the
  temporary folder it was built in. It was moved somewhere safe and the
  message said where, but the folder was then removed regardless — and if the
  move had also failed, the message pointed at a file that had just been
  deleted. The folder now outlives a run that is still holding one.
- An image whose name happens to contain the words "user cancelled" no longer
  silences its own failure. Cancelling was recognised by reading the words out
  of the message, and every failure carries the name of the image it happened
  to, so such a file ending in an error looked exactly like somebody pressing
  Cancel: the run ended quietly with nothing said.
- A vips that prints nothing at all is reported as unusable rather than
  assumed to be working. The check asked whether a particular complaint was
  absent, and a program that crashed before printing anything is silent.
- The settings window no longer closes itself after two minutes. It was
  guarded by a timer meant for a window that never opened, and the guard could
  not tell that from someone taking their time — the form vanished mid-answer
  and the questions started again one at a time.
- A file that was asked for and could not be resolved is reported. It used to
  disappear between being read and being accepted, so a selection could
  quietly become a smaller job than the one requested, with nothing said about
  the difference.

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
