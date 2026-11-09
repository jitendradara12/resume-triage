import {
  displayedRole,
  getRoleScore,
  type CandidateView,
  type LcaBand,
} from "./candidates";
import { fitTier, tierLabels, triageReason } from "./presentation";
import type { EvaluatedCandidate } from "./types";

export function exportCandidates(
  candidates: EvaluatedCandidate[],
  view: CandidateView,
  band: LcaBand,
) {
  const groupLabel = {
    lca_consultant: "LCA Consultant",
    uiux_intern: "UI/UX Design Intern",
    both: "Fits both roles",
    neither_uncertain: "Low match",
  };
  const rows: (string | number)[][] = [
    [
      "Rank",
      "Candidate",
      "Resume file",
      "Classification",
      "Displayed role fit",
      "LCA score (2-3 yrs wanted)",
      "LCA score (4-6 yrs wanted)",
      "UI/UX score",
      "Years in sustainability / LCA",
      "Years in UI/UX design",
      "Counted career years",
      "Why",
    ],
    ...candidates.map((candidate, index) => {
      const role = displayedRole(candidate, view, band);
      const evaluation = candidate.evaluations[role];
      const triaged =
        candidate.needs_human_review ||
        candidate.primary_classification === "neither_uncertain";
      return [
        index + 1,
        candidate.initials_or_alias,
        candidate.filename,
        candidate.needs_human_review
          ? "Check manually"
          : groupLabel[candidate.primary_classification],
        triaged ? "" : tierLabels[fitTier(evaluation, getRoleScore(candidate, role, band))].label,
        Math.round(getRoleScore(candidate, "lca_consultant", "jd_2_3y")),
        Math.round(getRoleScore(candidate, "lca_consultant", "prompt_4_6y")),
        Math.round(getRoleScore(candidate, "uiux_intern", band)),
        (candidate.relevant_years_by_domain.lca_consultant ?? 0).toFixed(1),
        (candidate.relevant_years_by_domain.uiux_intern ?? 0).toFixed(1),
        candidate.total_career_years.toFixed(1),
        triaged
          ? triageReason(candidate)
          : (evaluation.evidence_bullets[0] ?? ""),
      ];
    }),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value);
          const safe =
            typeof value === "string" && /^[\s]*[=+@-]/.test(text)
              ? `'${text}`
              : text;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `candidates_${view}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
