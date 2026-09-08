# Changelog

Notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-09-08

### Added

- The page background can be any colour, not only the four that were offered.
  The control is a list you can also type into: pick one of the presets, or
  write a colour of your own. `#C7DAE8`, `c7dae8` and `C7DAE8` are all
  accepted, and six hexadecimal digits is the whole rule; colours with
  transparency are not supported. What the background takes is written above
  the form, and a value that is not a colour is reported with everything else
  that needs correcting, with your other answers left in place.
- Headless configurations accept the same colours, written the same way. The
  four existing values keep working exactly as before.

### Changed

- The background control shows colours rather than names. Its list holds
  `#FFFFFF`, `#000000`, `#8E79E0` and `#204486`, and the field shows the one
  in force; the names are above the form instead. Showing "White (#FFFFFF)"
  made a control you can type into look like one you can only choose from, and
  editing what it put there was refused even when what you had written was a
  perfectly good colour.
- The colour swatches beside each preset are gone with the names. A control
  you can type into cannot carry them, and a swatch that stayed put while you
  typed a different colour would be showing you the wrong one.
- Where the settings are asked one question at a time — the fallback used when
  the form cannot be shown — the background list ends with "Custom colour...",
  which asks for the colour you want.

### Fixed

- A value typed into the form and submitted without first leaving the field is
  no longer read as the value it replaced. This affected the resolution and
  quality fields as well.
- Where the settings are asked one question at a time, a rejected answer comes
  back for you to correct instead of being replaced by the default, which
  looked as though it had been accepted. The reason is shown in the dialog
  that asks again rather than in a separate one before it. This covers the
  resolution and quality prompts as well as a colour of your own.

## [1.2.7] - 2026-09-08

### Fixed

- A save that fails no longer guesses why. It says what could not be done and
  then quotes the system's own explanation, so a folder that denies permission
  and a drive that cannot do the job are told apart. Both used to produce the
  same sentence, blaming the drive — including on a disk that was perfectly
  capable and a folder that simply would not accept a new file.
- Saving into a folder on another drive now works in cases where it used to
  fail outright. The PDF is put onto its name there by the ordinary method
  first, so a drive that supports it no longer depends on a system feature
  that some hosts do not provide.

## [1.2.6] - 2026-09-08

### Changed

- Saving into a folder on an exFAT drive now stops rather than working around
  what the drive cannot do. Nothing is written to the drive, the message says
  the drive cannot take the output name in one step, and the finished PDF is
  kept — the message says where. Putting the name on such a drive meant
  creating it and then filling it, and a name that exists before your document
  is in it can be left empty by an interrupted run, or taken by something else
  in between. Some large camera cards are formatted this way; every other
  drive, including FAT-formatted cards, is unaffected.
- A failed save reads in the order you need it: what went wrong in plain words
  first, and the system's own message after it.

## [1.2.5] - 2026-09-08

### Fixed

- Saving to a card or drive formatted for cameras is now a single step on most
  of them, rather than making the name and then filling it. There is no longer
  a moment in which your document's name exists with nothing in it, and a run
  that is interrupted cannot leave an empty PDF behind. FAT-formatted cards
  take this path; the older way remains only for exFAT, which cannot do it.
- On the drives that still need the older way, a file that appears at the name
  at the wrong moment is no longer deleted during cleanup: only the file this
  action itself created is removed.

## [1.2.4] - 2026-09-08

### Fixed

- Nothing that was already in your output folder is mistaken for this
  action's own working file. It makes a folder of its own to work in, which
  either gets made or does not — before, it took a name by opening it, and
  some things answer to that without being created: a shortcut pointing
  somewhere else was adopted that way and then deleted during cleanup.
- The action can no longer be left waiting forever by something occupying the
  name it wanted. Opening certain kinds of file waits for another program to
  read from it; making a folder never waits.
- Saving to a card or a drive formatted for cameras leaves the finished name
  unfinished for a much shorter moment: taking the name and putting the PDF
  into it are now one step rather than two, and if the second half fails the
  name is given back immediately.

## [1.2.3] - 2026-09-08

### Fixed

- A file another program puts where this action was about to write is never
  written over or deleted. The name is taken first, in one step that either
  gets it or does not, and only names it got are ever cleaned up. Before, a
  copy that failed because someone else had taken the name in the meantime was
  treated as this action's own work — and their file was removed.
- Saving to a card or a drive formatted for cameras no longer risks replacing
  a file that is already there. Those cannot hold the kind of link this uses,
  so the name is claimed as an empty file and the PDF is moved onto it in one
  step; what was there before is left alone, and the PDF is given a numbered
  name instead.
- A document inside a folder that appears where the PDF was going to be saved
  is left alone. Cleanup used to remove anything in there whose name matched
  the one it was expecting, whether this action had put it there or not.

## [1.2.2] - 2026-09-07

### Fixed

- A saved PDF is checked for being the one that was made. On a drive that
  cannot make the kind of link this uses, a file that appeared at the chosen
  name at the wrong moment could be reported as your finished document — and
  both copies of the real one were deleted, because a file of the right shape
  at the right name was taken as proof. The output is now identified as the
  file this run put there, and nothing else counts.
- A file selected by hand is always answered, even when another name for the
  same file was refused. Two names for one photograph — which a Mac gives out
  freely — meant the first one seen decided the fate of the other: a name this
  action cannot convert could make a convertible one disappear from the run
  without being converted or reported.
- A link is refused rather than followed. Selecting both a link and the
  photograph it points to put that photograph in the PDF twice, because the
  images found inside a folder skip links while a link selected by hand was
  followed to its target.
- A copy that fails part way no longer leaves a hidden file behind in your
  folder. Copying can fail after writing some or all of a file, and the copy
  was only cleaned up when it had reported success.

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
