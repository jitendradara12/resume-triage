import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clearStoredUploads, restoreCandidates, saveCandidates, UPLOAD_STORAGE_KEY } from "../src/candidateStorage.ts";
import { getCandidateView, upsertCandidate } from "../src/candidates.ts";

const baseline = JSON.parse(readFileSync(
  new URL("../data/baseline_candidates.json", import.meta.url), "utf8",
));

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function upload(id) {
  return {
    ...baseline.find((candidate) => candidate.initials_or_alias === "PS"),
    candidate_id: id,
    content_hash: `hash-${id}`,
    filename: `${id}.pdf`,
    matched_baseline: false,
  };
}

test("uploads, resume text, and evaluations survive refresh without duplicating baseline data", () => {
  const storage = memoryStorage();
  const uploads = [upload("jd"), upload("luke")];
  const candidates = [...baseline, ...uploads];
  assert.equal(saveCandidates(candidates, baseline, storage), true);
  assert.deepEqual(JSON.parse(storage.getItem(UPLOAD_STORAGE_KEY)), uploads);
  const restored = restoreCandidates(baseline, storage);
  assert.deepEqual(restored, candidates);
  assert.equal(getCandidateView(restored.at(-1)), "rejected");
  assert.deepEqual(restoreCandidates(baseline, storage), restored);
});

test("clearing uploads restores the baseline after refresh and preserves other browser data", () => {
  const storage = memoryStorage();
  storage.setItem("unrelated", "keep");
  saveCandidates([...baseline, upload("jd"), upload("luke")], baseline, storage);
  assert.equal(clearStoredUploads(storage), true);
  assert.deepEqual(restoreCandidates(baseline, storage), baseline);
  assert.equal(storage.getItem("unrelated"), "keep");
  assert.equal(clearStoredUploads({
    removeItem() { throw new Error("Storage blocked"); },
  }), false);
});

test("re-uploading the same content replaces its saved evaluation", () => {
  const storage = memoryStorage();
  const original = upload("jd");
  const updated = { ...original, candidate_id: "renamed", filename: "renamed.pdf" };
  const candidates = upsertCandidate([...baseline, original], updated);
  assert.equal(candidates.length, baseline.length + 1);
  saveCandidates(candidates, baseline, storage);
  assert.deepEqual(restoreCandidates(baseline, storage).at(-1), updated);
});

test("bundled baseline evaluations take priority over saved copies", () => {
  const storage = memoryStorage();
  storage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify([
    { ...baseline[0], needs_human_review: !baseline[0].needs_human_review },
    upload("jd"),
  ]));
  assert.deepEqual(restoreCandidates(baseline, storage), [...baseline, upload("jd")]);
  assert.equal(saveCandidates(baseline, baseline, memoryStorage()), true);
});

test("invalid or unavailable storage preserves baseline browsing", () => {
  const storage = memoryStorage();
  for (const value of ["broken JSON", "null", "{}", '[null, {}, {"candidate_id":"incomplete"}]']) {
    storage.setItem(UPLOAD_STORAGE_KEY, value);
    assert.deepEqual(restoreCandidates(baseline, storage), baseline);
  }
  assert.deepEqual(restoreCandidates(baseline, {
    getItem() { throw new Error("Storage blocked"); },
  }), baseline);
});

test("a storage quota failure reports failure without discarding the evaluated upload", () => {
  const candidates = [...baseline, upload("jd")];
  assert.equal(saveCandidates(candidates, baseline, {
    setItem() { throw new Error("Quota exceeded"); },
  }), false);
  assert.equal(candidates.length, baseline.length + 1);
  assert.equal(candidates.at(-1).candidate_id, "jd");
});
