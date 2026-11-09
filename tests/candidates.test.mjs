import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  candidateViews,
  belongsToView,
  displayedRole,
  experienceSummary,
  getCandidateView,
  getRoleScore,
  selectCandidates,
} from "../src/candidates.ts";

const baseline = JSON.parse(
  readFileSync(
    new URL("../data/baseline_candidates.json", import.meta.url),
    "utf8",
  ),
);

test("review queues and role groups keep the 47 baseline candidates discoverable", () => {
  assert.equal(baseline.length, 47);
  for (const candidate of baseline) {
    assert.ok(belongsToView(candidate, getCandidateView(candidate)));
    if (candidate.needs_human_review) {
      for (const view of candidateViews.filter(
        ({ id }) => id !== "human_review",
      )) {
        assert.equal(belongsToView(candidate, view.id), false);
      }
    }
  }
  assert.deepEqual(
    candidateViews.map(
      ({ id }) =>
        baseline.filter((candidate) => belongsToView(candidate, id)).length,
    ),
    [18, 23, 14, 2, 4],
  );
});

test("low-fit domain years are labelled without erasing extracted experience", () => {
  const ba = baseline.find((candidate) => candidate.initials_or_alias === "BA");
  const years = ba.relevant_years_by_domain.lca_consultant;
  assert.ok(years > 2);
  assert.equal(experienceSummary(ba, "lca_consultant"), `${years.toFixed(1)} yrs in sustainability / LCA`);
  assert.equal(ba.relevant_years_by_domain.lca_consultant, years);
  const hm = baseline.find((candidate) => candidate.initials_or_alias === "HM");
  assert.equal(experienceSummary(hm, "uiux_intern"), "0.0 yrs in UI/UX design");
});

test("both experience targets sort by the same score and role shown to the reviewer", () => {
  for (const { id: view } of candidateViews) {
    for (const band of ["jd_2_3y", "prompt_4_6y"]) {
      const ranked = selectCandidates(baseline, view, band, "", "score", false);
      const scores = ranked.map((candidate) =>
        getRoleScore(candidate, displayedRole(candidate, view, band), band),
      );
      assert.deepEqual(
        scores,
        [...scores].sort((a, b) => b - a),
      );
    }
  }
  const before = selectCandidates(
    baseline,
    "lca_consultant",
    "jd_2_3y",
    "",
    "score",
    false,
  );
  const after = selectCandidates(
    baseline,
    "lca_consultant",
    "prompt_4_6y",
    "",
    "score",
    false,
  );
  assert.notDeepEqual(
    before.map((candidate) => candidate.candidate_id),
    after.map((candidate) => candidate.candidate_id),
  );
});

test("the overqualification filter hides senior designers without changing their craft scores", () => {
  const snapshot = JSON.stringify(baseline);
  const ranked = selectCandidates(
    baseline,
    "uiux_intern",
    "jd_2_3y",
    "",
    "score",
    true,
  );
  assert.ok(ranked.length > 0 && ranked.length < 23);
  assert.ok(
    ranked.every(
      (candidate) =>
        candidate.evaluations.uiux_intern.seniority_flag !== "overqualified",
    ),
  );
  assert.equal(JSON.stringify(baseline), snapshot);
  assert.equal(
    belongsToView(
      baseline.find((candidate) => candidate.initials_or_alias === "BS"),
      "uiux_intern",
    ),
    true,
  );
});

test("search and experience sorting work together without mutating the source order", () => {
  const ids = baseline.map((candidate) => candidate.candidate_id);
  const ranked = selectCandidates(
    baseline,
    "lca_consultant",
    "jd_2_3y",
    " SIMAPRO ",
    "relevant_exp",
    false,
  );
  assert.ok(ranked.length > 0);
  const experience = ranked.map(
    (candidate) => candidate.relevant_years_by_domain.lca_consultant,
  );
  assert.deepEqual(
    experience,
    [...experience].sort((a, b) => b - a),
  );
  assert.deepEqual(
    baseline.map((candidate) => candidate.candidate_id),
    ids,
  );
  assert.deepEqual(
    selectCandidates(
      baseline,
      "lca_consultant",
      "jd_2_3y",
      "no-such-candidate",
      "score",
      false,
    ),
    [],
  );
});
