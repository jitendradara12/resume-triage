import type { Role } from "./candidates";
import type { EvaluatedCandidate, RoleMatchResult } from "./types";

export type Tone = "good" | "maybe" | "bad" | "neutral";

export const tierLabels: Record<
  RoleMatchResult["match_tier"],
  { label: string; tone: Tone }
> = {
  strong_match: { label: "Strong fit", tone: "good" },
  potential_match: { label: "Possible fit", tone: "maybe" },
  mismatch: { label: "Not a fit", tone: "bad" },
  uncertain: { label: "Unclear", tone: "neutral" },
};

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
    pass: "Uses LCA software (SimaPro, GaBi, openLCA…)",
    fail: "No LCA software found",
  },
  has_ghg_standards: {
    pass: "Knows carbon & ISO standards",
    fail: "No carbon or ISO standards found",
  },
  is_unrelated_domain: {
    pass: "Background fits the field",
    fail: "Background is mostly another field",
    negative: true,
  },
  has_figma_wireframing: {
    pass: "Uses Figma / wireframing",
    fail: "No Figma or wireframing found",
  },
  has_portfolio_projects: {
    pass: "Has design projects to show",
    fail: "No design projects found",
  },
  is_pure_graphic_or_unrelated: {
    pass: "Product / UX focus",
    fail: "Mostly graphic design or another field",
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
  return badge.replace(/^Domain Crossover:\s*/, "").replaceAll(" × ", " + ");
}

/** Why a candidate sits in "Check manually" or "Not a fit", without internal thresholds. */
export function triageReason(candidate: EvaluatedCandidate) {
  if (candidate.parse_status !== "ok")
    return "We couldn't read this file. Open the original resume to check it.";
  if (candidate.needs_human_review)
    return candidate.word_count < 100
      ? "Very short resume — not enough detail to judge."
      : "The match wasn't clear-cut. Worth a quick manual look.";
  const misses = (["lca_consultant", "uiux_intern"] as const).flatMap(
    (role) =>
      requirementChecks(candidate.evaluations[role])
        .filter((check) => !check.passed && !checks[check.key].negative)
        .map((check) => check.label)
        .slice(0, 1),
  );
  return `Doesn't match either role. ${misses.join("; ")}.`;
}

export function seniorityNote(
  candidate: EvaluatedCandidate,
  role: Role,
  minimumYears: number,
) {
  const evaluation = candidate.evaluations[role];
  if (evaluation.seniority_flag === "overqualified")
    return { label: "More senior than an intern", tone: "maybe" as Tone };
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
  if (!value) return "?";
  const match = /^(\d{4})-(\d{2})/.exec(value);
  return match ? `${months[Number(match[2]) - 1]} ${match[1]}` : value;
}

export function displayName(candidate: EvaluatedCandidate) {
  return candidate.parse_status === "ok"
    ? candidate.initials_or_alias
    : "Unreadable file";
}
