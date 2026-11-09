import {
  displayedRole,
  getRoleScore,
  type CandidateView,
  type LcaBand,
} from "./candidates";
import type { EvaluatedCandidate } from "./types";

export function exportCandidates(
  candidates: EvaluatedCandidate[],
  view: CandidateView,
  band: LcaBand,
) {
  const rows: (string | number)[][] = [
    [
      "Candidate ID",
      "Alias",
      "Filename",
      "Classification",
      "Needs human review",
      "LCA score (2-3 years)",
      "LCA score (4-6 years)",
      "UI/UX score",
      "LCA / sustainability years (extracted)",
      "UI/UX design years (extracted)",
      "Total career years",
      "Text repairs",
      "Rationale",
    ],
    ...candidates.map((candidate) => [
      candidate.candidate_id,
      candidate.initials_or_alias,
      candidate.filename,
      candidate.primary_classification,
      candidate.needs_human_review ? "YES" : "NO",
      getRoleScore(candidate, "lca_consultant", "jd_2_3y"),
      getRoleScore(candidate, "lca_consultant", "prompt_4_6y"),
      getRoleScore(candidate, "uiux_intern", band),
      candidate.relevant_years_by_domain.lca_consultant ?? 0,
      candidate.relevant_years_by_domain.uiux_intern ?? 0,
      candidate.total_career_years,
      candidate.forensic_repairs.length,
      candidate.needs_human_review || candidate.primary_classification === "neither_uncertain"
        ? candidate.classification_reason
        : candidate.evaluations[displayedRole(candidate, view, band)]
            .rationale_headline,
    ]),
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
