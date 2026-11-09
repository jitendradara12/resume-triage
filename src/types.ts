export interface ForensicRepair {
  raw_fragment: string;
  repaired_value: string;
  reason: string;
}

export interface WorkSpan {
  title: string;
  organization: string;
  start_date: string | null;
  end_date: string | null;
  months_duration: number;
  domain: "lca_sustainability" | "uiux_design" | "other";
  is_internship: boolean;
}

export interface RoleMatchResult {
  role_id: "lca_consultant" | "uiux_intern";
  match_tier: "strong_match" | "potential_match" | "mismatch" | "uncertain";
  overall_score: number;
  score_variants: Record<string, number>;
  sub_scores: Record<string, number>;
  gate_probabilities: Record<string, number>;
  hard_gates_passed: boolean;
  seniority_flag: "underqualified" | "target_band" | "overqualified";
  jev_confidence: number;
  evidence_bullets: string[];
  rationale_headline: string;
}

export interface EvaluatedCandidate {
  candidate_id: string;
  filename: string;
  content_hash: string;
  source_url: string | null;
  parse_status: "ok" | "empty_document" | "scanned_pdf" | "corrupted";
  parse_diagnostics: string | null;
  word_count: number;
  initials_or_alias: string;
  healed_text: string;
  education_summary: string;
  skills_and_tools: string[];
  key_projects_and_roles: string[];
  crossover_badges: string[];
  total_career_years: number;
  relevant_years_by_domain: Record<string, number>;
  primary_classification: "lca_consultant" | "uiux_intern" | "both" | "neither_uncertain";
  needs_human_review: boolean;
  classification_reason: string;
  forensic_repairs: ForensicRepair[];
  evaluations: Record<"lca_consultant" | "uiux_intern", RoleMatchResult>;
  work_spans: WorkSpan[];
  matched_baseline?: boolean;
  is_live_upload?: boolean;
}
