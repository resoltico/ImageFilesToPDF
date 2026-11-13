"use strict";
const { APP_NAME } = require("../../core/version.js");
const { noImagesHeadline, describeNoImages } = require("../../core/run-report.js");
const { showCompletion } = require("./completion.js");
const { showDetails } = require("./details-dialog.js");

function reportNoImages(app, rejected) {
    showDetails(app, { title: APP_NAME, summary: noImagesHeadline(rejected), detail: describeNoImages(rejected, false), fallbackDetail: describeNoImages(rejected), buttons: ["OK"] });
    return undefined;
}

function reportResult(app, result) {
    showCompletion(app, result);
    return undefined;
}
module.exports = { reportNoImages, reportResult };
