"use strict";

/** Owned before bytes exist; validating is retained until validation is resolved. */
function registerArtifact(artifacts, path) {
    if (artifacts.has(path)) { throw new Error("Artifact path is already owned."); }
    const artifact = { path, state: "building" };
    artifacts.set(path, artifact);
    return artifact;
}

function retainsArtifact(artifact) {
    return !artifact || !["building", "released"].includes(artifact.state);
}

function hasRetainedArtifacts(artifacts) {
    return [...artifacts.values()].some(retainsArtifact);
}

function requireValidatedArtifact(artifacts, path) {
    const artifact = artifacts.get(path);
    if (artifact?.state !== "validated") { throw new Error("Publication requires an owned validated PDF."); }
    return artifact;
}

function releaseArtifact(artifacts, path) {
    requireValidatedArtifact(artifacts, path).state = "released";
}

module.exports = { registerArtifact, retainsArtifact, hasRetainedArtifacts, requireValidatedArtifact, releaseArtifact };
