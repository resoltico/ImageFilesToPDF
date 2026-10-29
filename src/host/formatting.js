"use strict";

const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/*
 * "1 PDF" / "2 PDFs", rather than the "(s)" that stands in for it.
 */
function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.round(Number(milliseconds) / MILLISECONDS_PER_SECOND));
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;

    if (minutes <= 0) {
        return plural(seconds, "second");
    }

    return `${plural(minutes, "minute")}, ${plural(seconds, "second")}`;
}

module.exports = { plural, formatDuration };
