# Architecture & Data Flow

## 1. System Pipeline

```
Raw Upload (.docx / .pdf)
  │
  ├── [0 tokens / unreadable] ──> EvaluatedCandidate (status="empty_document", needs_human_review=True)
  │
  ▼ [Valid in-memory text]
Stage 1: System 2 (Gemini Flash) -> Stage1Extraction
  • Contextually heals regex damage ("Scope s" -> "Scope 1, 2, 3", "ISO  " -> "ISO 14040/44")
  • Outputs healed_text & logs edits to forensic_repairs audit list
  • Extracts structured work_spans (start/end dates, domain tag), skills, education, evidence bullets
  ▼
Stage 2: System 1 (TypeSafe Jev via asyncio.gather)
  • State passed to Jev: {"resume_text": stage1.healed_text, "profile": stage1.summary}
  • lca_plugin:  client.system_one(state, questions={...}) -> Noul gates + Score rubric
  • uiux_plugin: client.system_one(state, questions={...}) -> Noul gates + Score rubric
  ▼
Stage 3: Deterministic Aggregator (Python)
  • Merges overlapping date intervals for total_career_years & relevant_years_by_domain
  • Computes score_variants: {"jd_2_3y": ..., "prompt_4_6y": ...}
  • Synthesizes rationale_headline deterministically from Jev sub-scores
  • Assigns 4-way classification & sets needs_human_review flag
  ▼
Output JSON (Saved to data/baseline_candidates.json or returned by /api/evaluate)
```

---

## 2. Typed Data Contracts (`core/schemas.py`)

### Intermediate Contract: Stage 1 Extraction
```python
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
```

### Final Contract: Evaluated Candidate
```python
class RoleMatchResult(BaseModel):
    role_id: Literal["lca_consultant", "uiux_intern"]
    match_tier: Literal["strong_match", "potential_match", "mismatch", "uncertain"]
    overall_score: float                  # 0 - 100
    score_variants: dict[str, float]      # Precomputed for 0ms UI toggling: {"jd_2_3y": ..., "prompt_4_6y": ...}
    sub_scores: dict[str, float]          # Raw calibrated scores from Jev Score
    gate_probabilities: dict[str, float]  # Probabilities from Jev Noul
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
```

---

## 3. Shallow Plugin Architecture

Each role is a self-contained module implementing a flat protocol:

```python
from typing import Protocol
from core.schemas import RoleMatchResult

class RolePlugin(Protocol):
    role_id: str
    def get_questions(self, candidate_summary: dict) -> dict: ...
    def compute_scores(self, jev_response, candidate_state: dict) -> RoleMatchResult: ...
```

- In Stage 2, plugins pass `{"resume_text": stage1.healed_text, ...}` as `state` into Jev.
- Jev questions execute concurrently via `asyncio.gather(lca_eval, uiux_eval)`.

---

## 4. Vercel Serverless & Deployment

- `api/index.py`: Mounts FastAPI and sets `sys.path.insert(0, str(Path(__file__).resolve().parent.parent))`.
- `vercel.json`:
  ```json
  {
    "functions": { "api/index.py": { "maxDuration": 60 } },
    "rewrites": [
      { "source": "/api/(.*)", "destination": "/api/index.py" },
      { "source": "/((?!api/).*)", "destination": "/index.html" }
    ]
  }
  ```
- In-memory parsing only (`python-docx`, `pypdf`). Zero local disk storage.
