# TalentTriage

Screens and ranks resumes for an LCA Consultant and a UI/UX Design Intern. The app opens with 47 scored resumes and ranks new uploads alongside them.

## How ranking works

1. **Read and check for duplicates.** The server reads Word, PDF, and text files in memory. It hashes the text and checks the 47 baseline resumes first. Re-uploading an existing resume returns its saved result so the score never changes.
2. **Clean broken text without guessing facts.** Several source resumes have damaged text, such as `Scope s` or missing ISO numbers. The parser marks unrecoverable values as unreadable, normalizes missing-date placeholders, and highlights every change on the Resume tab. Missing digits, employers, quantities, and dates are never reconstructed from context. Evidence bullets quote the cleaned source text.
3. **Extract with Gemini, judge with Jev, decide in Python.** Instead of asking a language model to invent a final score, the app splits extraction, judgment, and scoring. Gemini pulls work dates, skills, education, and project evidence from the resume. Then **Jev**, TypeSafe's System One decision model, answers typed questions about each role's requirements and skill levels with probabilities. Finally, `core/scoring.py` combines Jev's judgments with the experience math to calculate the 0 to 100 scores and group each candidate.

### Role weights and experience

| Role | Score breakdown | Experience rule |
| :--- | :--- | :--- |
| LCA Consultant | Tools and data 40%, standards 35%, project depth 25% | Instant toggle between 2 to 3 years and 4 to 6 years |
| UI/UX Design Intern | UI craft 45%, product thinking 40%, user research 15% | No experience penalty. Flags more than 2 years in design as overqualified |

Missing a core requirement, such as LCA software or Figma, pulls the score down.

The scorer merges work dates by calendar month before counting years, so overlapping jobs count once. Sustainability / LCA experience includes adjacent environmental work. Teaching assistantships are excluded from all experience totals. For LCA, candidates below the selected experience target get a lower score. The scorer saves both the 2 to 3 year and 4 to 6 year scores up front, so switching targets in the UI is instant; displayed fit badges follow the selected score.

### Grouping and review

The main review groups are LCA, UI/UX, Check manually, and Low match. A candidate classified for both roles appears in both role lists.

- **Check manually.** Catches unreadable files, resumes under 100 words, and borderline cases instead of rejecting them silently.
- **Low match.** Requires a readable resume of at least 100 words, sufficient model confidence, scores below 25 on both roles, and failed qualification checks for both roles.
- **Cross-field profiles.** An overlapping view of candidates classified for both roles or flagged for topics across fields, such as design and frontend technologies. These badges can come from keyword mentions; they do not establish qualifications for a second role. Combined lists display and sort by the higher role score when sorting by score.

## Limits

Scores rank evidence on the page and do not replace a portfolio review. New uploads are processed on the server; browser localStorage keeps their evaluations across refreshes, and **Clear uploads** resets this browser's list to the 47 baseline resumes. Scanned PDFs without a text layer go to manual review.

## Run locally

Requires Python 3.12+, `uv`, and Node.js 24.

```sh
uv sync
npm ci
uv run uvicorn api.index:app --reload --port 8000
npm run dev
```

Open http://localhost:5173. Browsing the 47 resumes works without API keys. To score new uploads with Gemini and Jev, set `GEMINI_API_KEY` and `TYPESAFE_API_KEY` in `.env`.

## Test and build

```sh
npm test
npm run build
uv run python -m unittest discover -s tests -v
```
