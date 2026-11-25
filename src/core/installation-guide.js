"use strict";

const README = "https://github.com/resoltico/ImageFilesToPDF";
const INSTALL_OVERVIEW = `${README}#installing-the-tools`;
const INSTALL_GUIDES = Object.freeze({
    darwin: `${README}#macos`,
    linux: `${README}#linux`,
    win32: `${README}#windows`
});

module.exports = { INSTALL_GUIDES, INSTALL_OVERVIEW };
