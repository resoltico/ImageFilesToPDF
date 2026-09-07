# Changelog

Notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-09-07

### Fixed

- A finished PDF that could not be saved is never deleted. If the check that
  looks for a file could not be carried out — a folder the action is not
  allowed to look in, a system under strain — it answered "there is nothing
  there", and the recovery that was meant to rescue the PDF removed it and
  then reported it missing. Nothing is removed now that this run did not put
  there, and the PDF stays where it was built until it has been confirmed
  saved somewhere else.
- Saving to a folder that already holds a file of the same name never replaces
  it, whatever the reason the name could not be taken. It did in one case: a
  drive that cannot make the kind of link this uses fell back to an operation
  that quietly replaces what it finds. A file that appeared at the moment of
  saving, and a link left pointing at something that has been deleted, are now
  both recognised as the name being taken.
- On a drive that cannot make that kind of link, the PDF is no longer saved
  alongside its own name — the folder is left as it was and the PDF is kept
  for you instead.
- A saved PDF always contains your document. There was one way for it not to:
  the temporary copy the PDF is made through is named for the run that makes
  it, and if a file of exactly the same size already had that name, it was
  used instead of the PDF and the PDF was deleted. That name is now checked
  before anything is written to it.
- The same photograph selected twice is converted once, however it is spelled.
  A Mac does not distinguish upper from lower case in filenames as it comes,
  so selecting a folder together with a file inside it whose name you typed
  differently put that photograph in the PDF twice.
- A second PDF is numbered correctly inside a folder whose name contains a
  line break. Converting two images of the same name — photo.jpg and photo.png
  — inside such a folder failed instead of producing photo_2.pdf.

## [1.2.0] - 2026-09-07

### Added

- Selecting a folder converts the images inside it, through every subfolder,
  and writes the PDF to the folder you selected. Hidden items, application
  packages, links and files that are not images are passed over without
  comment — a folder of documents does not produce a complaint for every
  document — while anything that could not be read is reported by name, so
  nothing is left out of the PDF without your knowing. A folder holding no
  images says so rather than looking like an empty selection; selecting a
  folder and a file inside it does not convert that file twice; and a package,
  such as an application or a photo library, is refused rather than opened.
- The settings window says how many images were found before it asks anything
  else, so choosing Cancel is a decision rather than a guess. Selecting a
  folder can mean a great many images, and this is the last point before the
  work starts.
- The action reports what it is doing as it goes: which image it is preparing,
  and then creating, validating and saving the PDF. Whether that is displayed
  is up to the Shortcut the action runs in.

### Changed

- Images are ordered by their whole path rather than by name first, so a
  folder's images stay together and in order instead of interleaving with
  another folder's whenever the names happened to. Within a single folder the
  order is unchanged.

### Fixed

- A combined PDF of more than about ten thousand images no longer fails with
  "An error occurred." Every page had to be named on one command line, and
  there is a limit to how long one of those can be.
- A PDF that could not be saved no longer leaves something that looks like it
  in the output folder. Nothing is written to the name of your document any
  more: the finished PDF is put into the folder under a hidden name, checked
  there, and only then given the name you will see, in a single step that
  either creates that name or leaves it alone. Saving to a folder on another
  drive used to write your document's name a piece at a time, so an
  interruption left part of a PDF wearing it. An existing file is never
  replaced.
- A PDF is no longer reported as saved when it went somewhere else. A folder
  sitting where the PDF was to be written was not treated as an obstacle: the
  PDF was moved inside it and the run reported success. When a finished PDF
  cannot be published, the message now names where it actually is — it used to
  name the temporary folder it had been built in, which by then was empty.
- A file whose name is very long is converted instead of failing. The output
  name is longer than the name it came from, because it carries the date and
  time, and a long enough source name pushed it past what the filesystem
  accepts. It is shortened to fit, with room kept for the numbering that
  avoids overwriting an earlier PDF.
- Files whose names are long numbers sort in order. Beyond about sixteen
  digits two different numbers were read as the same value, so those pages
  came out in whatever order the files arrived in.

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
