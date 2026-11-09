import type { Role } from "./candidates";
import type { EvaluatedCandidate, RoleMatchResult } from "./types";

export type Tone = "good" | "maybe" | "bad" | "neutral";

export const tierLabels: Record<
  RoleMatchResult["match_tier"],
  { label: string; tone: Tone }
> = {
  strong_match: { label: "Strong fit", tone: "good" },
  potential_match: { label: "Possible fit", tone: "maybe" },
  mismatch: { label: "Low match", tone: "bad" },
  uncertain: { label: "Unclear", tone: "neutral" },
};

export function fitTier(evaluation: RoleMatchResult, score: number) {
  const tier = evaluation.match_tier;
  if (evaluation.role_id !== "lca_consultant" || tier === "uncertain" || tier === "mismatch")
    return tier;
  // The stricter experience target can lower a saved fit tier, never raise it.
  if (score < 38) return "mismatch";
  return tier === "strong_match" && score < 65 ? "potential_match" : tier;
}

export const domainLabels: Record<Role, string> = {
  lca_consultant: "sustainability / LCA",
  uiux_intern: "UI/UX design",
};

/** Score components with the weights the backend uses, so the total is explainable. */
export const criterionLabels: Record<string, string> = {
  software_and_data_mastery: "LCA tools & data (40%)",
  methodology_and_standards: "Standards & methods (35%)",
  project_depth: "Project depth (25%)",
  ui_craft_and_systems: "UI craft & design systems (45%)",
  product_thinking: "Product thinking (40%)",
  ux_research_methods: "User research (15%)",
};

/**
 * Requirement checks in plain words. Negative checks (an unrelated background)
 * pass when their probability is low.
 */
const checks: Record<string, { pass: string; fail: string; negative?: boolean }> = {
  has_lca_software: {
    pass: "Evidence of LCA software or database use",
    fail: "Limited evidence of LCA software or database use",
  },
  has_ghg_standards: {
    pass: "Evidence of carbon or ISO methods",
    fail: "Limited evidence of carbon or ISO methods",
  },
  is_unrelated_domain: {
    pass: "Background fits the field",
    fail: "Background may be mostly another field",
    negative: true,
  },
  has_figma_wireframing: {
    pass: "Evidence of UI tools, wireframing, or prototyping",
    fail: "Limited evidence of UI tools, wireframing, or prototyping",
  },
  has_portfolio_projects: {
    pass: "Evidence of digital product design projects",
    fail: "Limited evidence of digital product design projects",
  },
  is_pure_graphic_or_unrelated: {
    pass: "Product / UX focus",
    fail: "May focus on graphic design or another field",
    negative: true,
  },
};

export function requirementChecks(evaluation: RoleMatchResult) {
  return Object.entries(evaluation.gate_probabilities)
    .filter(([key]) => key in checks)
    .map(([key, probability]) => {
      const check = checks[key];
      const passed = check.negative ? probability < 0.5 : probability >= 0.5;
      return { key, passed, label: passed ? check.pass : check.fail };
    })
    // Not being flagged as unrelated isn't evidence of fit, so only show the flag.
    .filter((check) => !(check.passed && checks[check.key].negative));
}

export function crossoverLabel(badge: string) {
  const labels: Record<string, string> = {
    "Domain Crossover: Sustainability × Design": "Also mentions sustainability",
    "Domain Crossover: Design × Frontend Engineering": "Also mentions frontend technologies",
    "Domain Crossover: LCA × Software Engineering": "Also mentions software",
    "Domain Crossover: LCA × UI/UX": "Some UI/UX evidence",
  };
  return labels[badge] ?? badge.replace(/^Domain Crossover:\s*/, "").replaceAll(" × ", " + ");
}

/** Explain the review queues without treating a score as a hiring decision. */
export function triageReason(candidate: EvaluatedCandidate) {
  if (candidate.parse_status !== "ok")
    return candidate.source_url
      ? "We couldn't extract text from this file. Inspect the source resume."
      : "We couldn't extract text from this file. Try a text-based PDF, DOCX, or TXT file.";
  if (candidate.needs_human_review)
    return candidate.word_count < 100
      ? "Very short resume. Not enough detail to judge."
      : "The match is uncertain. Review the resume before deciding.";
  const misses = (["lca_consultant", "uiux_intern"] as const).flatMap(
    (role) =>
      requirementChecks(candidate.evaluations[role])
        .filter((check) => !check.passed && !checks[check.key].negative)
        .map((check) => check.label)
        .slice(0, 1),
  );
  return ["Low match for both roles.", misses.length ? `${misses.join("; ")}.` : ""].filter(Boolean).join(" ");
}

export function seniorityNote(
  candidate: EvaluatedCandidate,
  role: Role,
  minimumYears: number,
) {
  const evaluation = candidate.evaluations[role];
  if (evaluation.seniority_flag === "overqualified")
    return {
      label: role === "uiux_intern"
        ? "Above the internship experience target"
        : "Above the experience target",
      tone: "maybe" as Tone,
    };
  if (
    role === "lca_consultant" &&
    evaluation.match_tier !== "mismatch" &&
    (candidate.relevant_years_by_domain[role] ?? 0) < minimumYears
  )
    return { label: "Less experience than wanted", tone: "maybe" as Tone };
  return null;
}

const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

export function formatMonth(value: string | null) {
  if (!value) return "Date not listed";
  const match = /^(\d{4})-(\d{2})/.exec(value);
  return match ? `${months[Number(match[2]) - 1]} ${match[1]}` : value;
}

export function displayName(candidate: EvaluatedCandidate) {
  return candidate.parse_status === "ok"
    ? candidate.initials_or_alias
    : "Unreadable file";
}
