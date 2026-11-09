# TalentTriage

Screens and ranks resumes for an LCA Consultant and a UI/UX Design Intern. The app opens with 47 scored resumes and ranks new uploads alongside them.

## How ranking works

1. **Read and check for duplicates.** The server reads Word, PDF, and text files in memory. It hashes the text and checks the 47 baseline resumes first. Re-uploading an existing resume returns its saved result so the score never changes.
2. **Fix broken text.** Several source resumes have words split during file conversion, like `Scope s` instead of `Scope 3`. The parser fixes these before extraction and highlights every change on the Resume tab.
3. **Extract with Gemini, judge with Jev, decide in Python.** Instead of asking a language model to invent a final score, the app splits extraction, judgment, and scoring. Gemini pulls work dates, skills, education, and project evidence from the resume. Then **Jev**, TypeSafe's System One decision model, answers typed questions about each role's requirements and skill levels with probabilities. Finally, `core/scoring.py` combines Jev's judgments with the experience math to calculate the 0 to 100 scores and group each candidate.

### Role weights and experience

| Role | Score breakdown | Experience rule |
| :--- | :--- | :--- |
| LCA Consultant | Tools and data 40%, standards 35%, project depth 25% | Instant toggle between 2 to 3 years and 4 to 6 years |
| UI/UX Design Intern | UI craft 45%, product thinking 40%, user research 15% | No penalty for junior candidates. Flags 2+ years as overqualified |

Missing a core requirement, such as LCA software or Figma, pulls the score down.

The scorer merges work dates by calendar month before counting years, so overlapping jobs count once. Only jobs in the field count toward role experience, and teaching assistantships do not count as industry LCA work. For LCA, candidates below the selected experience target get a lower score. The scorer saves both the 2 to 3 year and 4 to 6 year scores up front, so switching targets in the UI is instant.

### Grouping and review

Each resume lands in LCA, UI/UX, Mixed skills, Check manually, or Not a fit.

- **Check manually.** Catches unreadable files, resumes under 100 words, and borderline cases instead of rejecting them silently.
- **Not a fit.** Requires a readable resume over 100 words that scores below 25 on both roles and misses both roles' core requirements.
- **Mixed skills.** Shows candidates who pass both roles at 60 or above, or who have work across both fields.

## Limits

Scores rank evidence on the page and do not replace a portfolio review. Browser localStorage keeps uploaded evaluations across refreshes, and **Clear uploads** resets the list to the 47 baseline resumes. Scanned PDFs without a text layer go to manual review.

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
