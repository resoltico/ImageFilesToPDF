"use strict";
const {OperationError}=require("../../../src/core/errors.js");
const {registerArtifact}=require("../../../src/core/artifacts.js");
const {documentPlan}=require("../../../src/core/document-plan.js");

function fixture(count = 1, options = {}) {
    const events = [];
    const owned = new Set();
    const artifacts = new Map();
    const sources = Array.from({ length: count }, (ignored, index) => ({ path: `/source/${index}.png`, originalName: `${index}.png`, folder: "/out/" }));
    const ports = {
        allocate: (index) => registerArtifact(artifacts, `/work/${index}.pdf`),
        beginning: (source) => { events.push(["begin", source.path]); },
        prepare(source, index) {
            if (options.fail === index) { throw options.error ?? new OperationError("bad source"); }
            const page = { path: `/work/${index}.jpg`, size: options.size ?? 1 };
            owned.add(page.path);
            return page;
        },
        fits: (ignored, pages) => pages.length <= (options.argv ?? 100),
        import: (staged, pages) => { events.push(["import", pages.slice()]); owned.add(staged); },
        assemble: (staged) => { events.push(["assemble", staged]); },
        beforeValidation: () => { events.push(["retain"]); },
        validate: (staged, expected) => { events.push(["validate", staged, expected]); },
        publish: (staged, path) => { events.push(["publish", staged, path]); owned.delete(staged); artifacts.get(staged).state="released"; return { path: `${path}.actual`, issues: [] }; },
        remove: (path) => { events.push(["remove", path]); owned.delete(path); },
        prepared: () => { events.push(["prepared"]); },
        completed: () => { events.push(["saved"]); },
        ...options.ports
    };
    return { ports, events, owned, artifacts, plans: documentPlan({mode: options.mode ?? "combined"}, sources, "20261029_123456", sources.map((unused,index)=>index)) };
}

module.exports={fixture};
