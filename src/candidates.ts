import type { EvaluatedCandidate, RoleMatchResult } from "./types";

export type Role = RoleMatchResult["role_id"];
export type CandidateView = Role | "both" | "human_review" | "rejected";
export type LcaBand = "jd_2_3y" | "prompt_4_6y";
export type SortField = "score" | "relevant_exp" | "total_exp";

export const roleLabels: Record<Role, string> = {
  lca_consultant: "LCA Consultant",
  uiux_intern: "UI/UX Design Intern",
};

export const candidateViews: { id: CandidateView; label: string }[] = [
  { id: "lca_consultant", label: roleLabels.lca_consultant },
  { id: "uiux_intern", label: roleLabels.uiux_intern },
  { id: "both", label: "Mixed skills" },
  { id: "human_review", label: "Check manually" },
  { id: "rejected", label: "Not a fit" },
];

export function upsertCandidate(
  candidates: EvaluatedCandidate[],
  candidate: EvaluatedCandidate,
) {
  const index = candidates.findIndex(
    (item) =>
      item.content_hash === candidate.content_hash ||
      item.candidate_id === candidate.candidate_id,
  );
  return index < 0
    ? [...candidates, candidate]
    : candidates.map((item, i) => (i === index ? candidate : item));
}

export function belongsToView(
  candidate: EvaluatedCandidate,
  view: CandidateView,
  hideOverqualified = false,
) {
  if (view === "human_review") return candidate.needs_human_review;
  if (candidate.needs_human_review) return false;
  if (view === "rejected")
    return candidate.primary_classification === "neither_uncertain";
  if (view === "both")
    return (
      candidate.primary_classification === "both" ||
      candidate.crossover_badges.length > 0
    );
  return (
    (candidate.primary_classification === view ||
      candidate.primary_classification === "both") &&
    !(
      view === "uiux_intern" &&
      hideOverqualified &&
      candidate.evaluations.uiux_intern.seniority_flag === "overqualified"
    )
  );
}

export function getRoleScore(
  candidate: EvaluatedCandidate,
  role: Role,
  band: LcaBand,
) {
  const evaluation = candidate.evaluations[role];
  return role === "lca_consultant"
    ? (evaluation.score_variants[band] ?? evaluation.overall_score)
    : evaluation.overall_score;
}

export const minimumYears: Record<LcaBand, number> = {
  jd_2_3y: 2,
  prompt_4_6y: 4,
};

export function experienceSummary(candidate: EvaluatedCandidate, role: Role) {
  const domain = role === "lca_consultant" ? "sustainability / LCA" : "UI/UX design";
  return `${(candidate.relevant_years_by_domain[role] ?? 0).toFixed(1)} yrs in ${domain}`;
}

export function displayedRole(
  candidate: EvaluatedCandidate,
  view: CandidateView,
  band: LcaBand,
): Role {
  if (view === "lca_consultant" || view === "uiux_intern") return view;
  return getRoleScore(candidate, "uiux_intern", band) >
    getRoleScore(candidate, "lca_consultant", band)
    ? "uiux_intern"
    : "lca_consultant";
}

export function getCandidateView(candidate: EvaluatedCandidate): CandidateView {
  if (candidate.needs_human_review) return "human_review";
  return candidate.primary_classification === "neither_uncertain"
    ? "rejected"
    : candidate.primary_classification;
}

export function selectCandidates(
  candidates: EvaluatedCandidate[],
  view: CandidateView,
  band: LcaBand,
  query: string,
  sort: SortField,
  hideOverqualified: boolean,
) {
  const search = query.trim().toLowerCase();
  const value = (candidate: EvaluatedCandidate) => {
    const role = displayedRole(candidate, view, band);
    if (sort === "total_exp") return candidate.total_career_years;
    if (sort === "relevant_exp")
      return candidate.relevant_years_by_domain[role] ?? 0;
    return getRoleScore(candidate, role, band);
  };
  return candidates
    .filter(
      (candidate) =>
        belongsToView(candidate, view, hideOverqualified) &&
        [
          candidate.initials_or_alias,
          candidate.filename,
          candidate.education_summary,
          ...candidate.skills_and_tools,
          ...candidate.key_projects_and_roles,
          ...candidate.crossover_badges,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search),
    )
    .sort((a, b) => value(b) - value(a));
}
