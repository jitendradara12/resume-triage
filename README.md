# TalentTriage

A resume screening prototype for an LCA Consultant and a UI/UX Design Intern. It opens with 47 pre-evaluated resumes and ranks new uploads alongside them.

## Run locally

Use Python 3.12+, `uv`, and Node.js 24.

```sh
uv sync
npm ci
```

Start the API and frontend in separate terminals:

```sh
uv run uvicorn api.index:app --reload --port 8000
```

```sh
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to FastAPI. Baseline browsing works without API keys. For model-backed uploads, set `GEMINI_API_KEY` and the decision provider's key in `.env`. The current decision provider defaults to OpenRouter using `OPENROUTER_API_KEY`; `TYPESAFE_API_KEY` is also supported. Never put keys in frontend environment variables.

## Methodology

1. Parse Word and PDF uploads in memory. Preserve the source reference and route unreadable documents to human review.
2. Normalize the extracted text and compare its SHA-256 hash with the baseline. A match returns the saved evaluation, preventing different scores on repeated uploads.
3. Repair known anonymization damage and record the original text, replacement, and reason. Gemini extracts skills, education, projects, evidence, and work dates. Reviewers can inspect the full resume and highlighted repairs.
4. Evaluate each role's skills and requirements independently. Calculate scores and classifications in Python, rather than asking a model for a final ranking.

### Role scores

| Role                | Weighted criteria                                                   | Experience policy                                                                   |
| ------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| LCA Consultant      | Software and data 40%, methods and standards 35%, project depth 25% | Precompute both 2–3 year and 4–6 year targets                                       |
| UI/UX Design Intern | UI craft and systems 45%, UX research 15%, product thinking 40%     | Full craft score at every experience level; flag more than 2 years as overqualified |

Requirement probabilities adjust the weighted composite. Strong evidence can increase it; missing requirements or an unrelated background reduce it. Scores are capped at 100. The exact gate thresholds and factors are in `core/scoring.py`.

For LCA, multiply the adjusted composite by the following factor, where `y` is relevant years:

| Experience         | 2–3 year target   | 4–6 year target          |
| ------------------ | ----------------- | ------------------------ |
| Below 2 years      | `0.60 + 0.20 × y` | `0.50 + 0.125 × y`       |
| 2 to below 4 years | `1.00`            | `0.75 + 0.125 × (y − 2)` |
| 4 years or more    | `1.00`            | `1.00`                   |

Work dates are merged by calendar month within each domain and across the full career, so overlapping dated roles count once. Teaching assistantships are excluded. Undated roles use the extracted duration, capped at 120 months per role; those estimates cannot be checked for overlap. Ongoing roles use November 2026 as the reference date for this corpus.

### Classification and review

Candidates receive an LCA, UI/UX, both, or neither/uncertain classification. Both roles must pass their requirements and score at least 60 for a candidate to match both. Other matched profiles enter the stronger role's group. Crossovers include both-role matches and profiles with evidence across domains; the crossover label does not mean that both roles passed.

Confident rejections require a readable resume with at least 100 words, both role scores below 25, and neither role's domain gates passed. A confidence below 25% for either role prevents rejection. The unrelated-domain probabilities do not block rejection when both scores and domain gates establish a nonmatch. Unreadable files, profiles under 100 words, and unresolved or borderline nonmatches enter human review. Current routing thresholds live in `core/scoring.py`; `docs/spec.md` records the original hypotheses and the calibrated rejection rule.

The LCA target control changes scores and rank order instantly using saved variants. Stored classifications use the 2–3 year score and do not change with that control. The UI/UX filter hides overqualified candidates without lowering their scores.

### Limits

Scores support human review. They measure evidence in a resume, not verified ability or portfolio quality. Model extractions and inferred text repairs can be wrong. Review the source file where evidence is unclear.

When model services are unavailable, the pipeline falls back to rules and keyword evidence. Treat those evaluations as less reliable. Upload evaluations, including extracted resume text, are saved in localStorage and restored after refresh without API calls. They stay in the same browser and site until its data is cleared; original files are not stored. **Clear uploads** removes saved test uploads and restores the 47 bundled resumes. Baseline evaluations always come from the bundled data. If browser storage is unavailable or full, uploads remain visible for the current session and the app shows a warning. The API's upload cache is temporary. The prototype has no shared upload database or OCR for scanned PDFs.

Experience totals reflect extracted work-history domains. For low-scoring roles with failed domain gates, the UI labels these as LCA/sustainability or UI/UX design years rather than implying a qualified role match. ESG or compliance tenure is preserved; it does not establish hands-on LCA modeling. The experience target can be changed above the LCA table or inside the candidate drawer.

## Code layout

- `src/App.tsx`: page composition and reviewer controls.
- `src/candidates.ts`: shared grouping, search, score selection, and sorting rules.
- `src/useCandidates.ts`: baseline state and upload requests.
- `src/candidateStorage.ts`: browser storage for upload evaluations and baseline-safe restoration.
- `src/CandidateTable.tsx`, `src/CandidateDrawer.tsx`: ranking list and candidate review.
- `src/exportCandidates.ts`: CSV export of the current results.
- `core/`: parsing, model clients, scoring, schemas, and pipeline orchestration.
- `api/index.py`: FastAPI routes and deterministic baseline matching.
- `data/baseline_candidates.json`: the single baseline source, imported into the static frontend and read by the API.

## Verify and build

```sh
npm test
npm run build
uv run python -m unittest discover -s tests -v
```

The frontend tests cover baseline groups, both LCA targets, search, sorting, overqualification filtering, and upload persistence with duplicate and storage-failure handling. Backend benchmarks cover parsing failures, repairs, experience merging, classification edge cases, uploads, and baseline matching. Set the model API keys to empty strings when running backend tests to exercise the offline fallback without external requests.

To regenerate the baseline after a deliberate scoring change, restore the 47 source files under `resumes/` and run `uv run python scripts/generate_baseline.py`. This calls the configured model services and overwrites the saved evaluations. Inspect the output and rerun the benchmarks before deploying.

Vercel builds the frontend into `dist/` and runs FastAPI through `api/index.py` with a 60-second limit. See `vercel.json` for routing and `docs/architecture.md` for the fixed deployment and data contracts.
