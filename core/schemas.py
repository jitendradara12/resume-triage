from typing import Literal
from pydantic import BaseModel, Field


class ForensicRepair(BaseModel):
    raw_fragment: str          # e.g. "Scope s"
    repaired_value: str        # e.g. "Scope 1, 2, 3"
    reason: str                # e.g. "Restored regex-stripped digits from GHG context"


class WorkSpan(BaseModel):
    title: str
    organization: str
    start_date: str | None     # ISO YYYY-MM or "YYYY"
    end_date: str | None       # ISO YYYY-MM, "YYYY", or "Present"
    months_duration: int
    domain: Literal["lca_sustainability", "uiux_design", "other"]
    is_internship: bool


class Stage1Extraction(BaseModel):
    healed_text: str           # Full resume text with anonymization damage repaired
    forensic_repairs: list[ForensicRepair]
    education_summary: str
    skills_and_tools: list[str]
    key_projects_and_roles: list[str]
    work_spans: list[WorkSpan]
    lca_evidence_bullets: list[str]
    uiux_evidence_bullets: list[str]


class RoleMatchResult(BaseModel):
    role_id: Literal["lca_consultant", "uiux_intern"]
    match_tier: Literal["strong_match", "potential_match", "mismatch", "uncertain"]
    overall_score: float                  # 0 - 100
    score_variants: dict[str, float]      # Precomputed for 0ms UI toggling: {"jd_2_3y": ..., "prompt_4_6y": ...}
    sub_scores: dict[str, float]          # Raw calibrated scores from Jev Score (0 - 100 normalized or raw)
    gate_probabilities: dict[str, float]  # Probabilities from Jev Noul (0.0 - 1.0)
    hard_gates_passed: bool
    seniority_flag: Literal["underqualified", "target_band", "overqualified"]
    jev_confidence: float
    evidence_bullets: list[str]           # Extracted by Gemini Flash in Stage 1
    rationale_headline: str               # Deterministically synthesized in Stage 3


class EvaluatedCandidate(BaseModel):
    candidate_id: str
    filename: str
    content_hash: str                     # SHA-256 of normalized raw text (for instant baseline deduplication)
    source_url: str | None                # Zoho download link for baseline; None for live uploads
    parse_status: Literal["ok", "empty_document", "scanned_pdf", "corrupted"]
    parse_diagnostics: str | None
    word_count: int
    initials_or_alias: str

    # Inline text & profile for Reviewer Drawer
    healed_text: str                      # Enables reading resume inline & highlighting repairs
    education_summary: str
    skills_and_tools: list[str]
    key_projects_and_roles: list[str]
    crossover_badges: list[str] = Field(default_factory=list)

    # Experience math (computed via interval merging in Stage 3)
    total_career_years: float
    relevant_years_by_domain: dict[str, float]

    # Classification & Triage
    primary_classification: Literal["lca_consultant", "uiux_intern", "both", "neither_uncertain"]
    needs_human_review: bool              # True: Human Review Queue; False: Confident Reject
    classification_reason: str

    forensic_repairs: list[ForensicRepair]
    evaluations: dict[str, RoleMatchResult]
    work_spans: list[WorkSpan] = Field(default_factory=list)
    matched_baseline: bool = False
