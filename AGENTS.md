# AGENTS.md

## Mission

Build and deploy a resume screening and ranking prototype for two roles:

1. **LCA Consultant** (Target: 2–3 yrs / 4–6 yrs --keeping both because ambiguous)
2. **UI/UX Design Intern** (Target: 0–1 yr, with overqualification governance)

Reviewers evaluate 47 baseline resumes from Zoho WorkDrive plus live uploads on a free Vercel deployment.

> Always build code cleanly, modularly, and with proper architecture and separation of concerns. Never simply bolt on a feature because I asked for it. If you can’t find an easy way to build it naturally, and you'd recommend a refactor to make the whole thing cleanly, stop your work ahead of time and say so.

---

## Operating Rules & Non-Negotiables

### 1. Fix Contracts, Liberate Heuristics

- The deployment topology, state model, and schema contracts in `docs/architecture.md` are locked down.
- All rubric weights, scoring criteria, and prompts in `docs/spec.md` are **v1 hypotheses**: benchmark against `resumes/`, inspect failures, and refine.

### 2. Infrastructure Guardrails

- **Stack:** Vite + React + Tailwind frontend (static build), FastAPI `/api/index.py` backend managed by `uv`.
- **Vercel Serverless:** Max duration 60s, unzipped dependencies < 250MB, read-only disk rule (parse `.docx` and `.pdf` strictly in-memory via `io.BytesIO`).
- **Keys:** Use `GEMINI_API_KEY` (Gemini Flash on Vertex AI / Google GenAI SDK) and `TYPESAFE_API_KEY` (TypeSafe Jev might be not available for now so currently using another decision model with jev in mind for near future).

### 3. Hybrid State Model & Hash Matching

- **Offline Baseline:** Pre-score the 47 Zoho resumes into `data/baseline_candidates.json`. The app loads all 47 candidates at second-0 with zero API calls.
- **Deduplication / Live Upload Trap:** Live uploads calculate a SHA-256 `content_hash` of normalized text. If a reviewer tests by re-uploading one of the 47 baseline files, return the baseline evaluation deterministically with a `"Matched Baseline Candidate"` notice to prevent LLM score drift.
- **Traceability & Drawer:** Store `healed_text` so reviewers can read the full resume inline in the drawer and see `forensic_repairs` highlighted without downloading `.docx` files.

### 4. Anti-Auto-Reject Requirements

- **Forensic Repair Audit Trail:** Contextually heal regex-mangled tokens (`"Scope s"`, `"ISO  "`), clean undated fields, and record every repair in `forensic_repairs` so the UI can display a transparent cleanup badge.
- **Experience Math:** Calculate `relevant_years` strictly separate from `total_career_years` using date interval merging.
- **0ms UI Toggles:** Precompute `jd_2_3y` and `prompt_4_6y` score variants so reviewers can switch experience targets instantly in the browser without re-evaluating.
- **Overqualification:** Keep UI/UX multiplier at 1.00 (evaluate raw craft honestly). Flag candidates with >2 yrs experience as `seniority_flag: "overqualified"` and provide a UI filter toggle.
- **4-Way Classification:** Classify every candidate as `LCA`, `UI/UX`, `Both`, or `Neither/Uncertain`.
  - Confident rejects (e.g. Axis Bank Risk Manager) -> Rejected tab.
  - Empty files (`1793685080327.docx`), ultra-sparse profiles, or low confidence -> Human Review Queue (`needs_human_review: true`).

---

## Reference Docs

- [`docs/architecture.md`](docs/architecture.md): Data flow pipeline, intermediate/final schemas, and Vercel routing.
- [`docs/spec.md`](docs/spec.md): Role specifications, v1 rubric hypotheses, Jev question specs, experience curves, and benchmark edge cases.
