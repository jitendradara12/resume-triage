import { useMemo, useRef, useState } from "react";
import { Download, Search, Upload, X } from "lucide-react";
import { CandidateDrawer } from "./CandidateDrawer";
import { CandidateTable } from "./CandidateTable";
import {
  belongsToView,
  candidateViews,
  getCandidateView,
  selectCandidates,
  type CandidateView,
  type LcaBand,
  type SortField,
} from "./candidates";
import { exportCandidates } from "./exportCandidates";
import type { EvaluatedCandidate } from "./types";
import { useCandidates } from "./useCandidates";

export function App() {
  const {
    candidates,
    upload,
    isUploading,
    notice,
    error,
    clearNotice,
    clearError,
  } = useCandidates();
  const [view, setView] = useState<CandidateView>("lca_consultant");
  const [band, setBand] = useState<LcaBand>("jd_2_3y");
  const [hideOverqualified, setHideOverqualified] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortField>("score");
  const [selected, setSelected] = useState<EvaluatedCandidate | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const visibleCandidates = useMemo(
    () =>
      selectCandidates(candidates, view, band, query, sort, hideOverqualified),
    [candidates, view, band, query, sort, hideOverqualified],
  );

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="page-width header-content">
          <div>
            <h1>TalentTriage</h1>
            <p className="muted">
              {candidates.length} resumes · Two roles to review
            </p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="button"
              onClick={() => exportCandidates(visibleCandidates, view, band)}
              disabled={visibleCandidates.length === 0}
            >
              <Download size={16} /> Export CSV
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".docx,.pdf,.txt"
              hidden
              disabled={isUploading}
              aria-label="Choose a resume"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                const candidate = await upload(file);
                if (candidate) {
                  setView(getCandidateView(candidate));
                  setQuery("");
                  setHideOverqualified(false);
                  setSort("score");
                  setSelected(candidate);
                }
              }}
            />
            <button
              type="button"
              className="button primary"
              disabled={isUploading}
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={16} />{" "}
              {isUploading ? "Evaluating…" : "Upload resume"}
            </button>
          </div>
        </div>
      </header>
      <main className="page-width main-content">
        <details className="methodology">
          <summary>How ranking works</summary>
          <div className="methodology-content">
            <p className="muted upload-help">
              Upload a PDF, Word document, or text file to rank it with the
              existing candidates. Upload evaluations are saved in this browser
              and stay available after refresh.
            </p>
            <p>
              Resumes are cleaned with an audit trail, then evaluated against
              each role. Scores support a reviewer's judgment; they are not
              hiring decisions.
            </p>
            <p>
              LCA weights software and data at 40%, methods and standards at
              35%, and project depth at 25%. UI/UX weights craft and systems at
              45%, UX research at 15%, and product thinking at 40%. Requirement
              probabilities adjust each weighted score.
            </p>
            <p>
              LCA scores also reflect the selected experience target. Both
              targets are precomputed, so switching is instant. UI/UX craft
              scores have no experience penalty; candidates with more than two
              years of relevant experience are flagged as overqualified.
            </p>
            <p>
              Overlapping work periods count once. Relevant experience is
              separate from total career experience. Sparse or unreadable
              resumes go to human review. Re-uploading a baseline resume keeps
              its original evaluation.
            </p>
            <p>
              Open a candidate for the evidence, score breakdown, full resume,
              text repairs, and work history. Role groups reflect the stored
              classification; changing the experience target changes scores and
              order.
            </p>
          </div>
        </details>
        {isUploading && (
          <p className="notice" role="status">
            Reading and evaluating the resume. This can take up to a minute.
          </p>
        )}
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              className="icon-button"
              onClick={clearNotice}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              onClick={clearError}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <nav className="candidate-nav" aria-label="Candidate groups">
          {candidateViews.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={view === item.id}
              onClick={() => setView(item.id)}
            >
              {item.label}
              <span>
                {
                  candidates.filter((candidate) =>
                    belongsToView(candidate, item.id, hideOverqualified),
                  ).length
                }
              </span>
            </button>
          ))}
        </nav>
        <div className="ranking-context">
          <div>
            <h2>{candidateViews.find((item) => item.id === view)?.label}</h2>
            <p className="muted">
              {
                {
                  lca_consultant:
                    "Life cycle assessment and sustainability experience.",
                  uiux_intern:
                    "Product design craft for a 0–1 year internship.",
                  both: "Candidates who match both roles or have evidence across domains.",
                  human_review:
                    "Sparse, unreadable, or uncertain profiles that need a closer look.",
                  rejected:
                    "Profiles with strong evidence of low alignment with both roles.",
                }[view]
              }
            </p>
          </div>
          {view === "lca_consultant" && (
            <label className="field-label">
              Experience target
              <select
                value={band}
                onChange={(event) => setBand(event.target.value as LcaBand)}
              >
                <option value="jd_2_3y">2–3 years · JD</option>
                <option value="prompt_4_6y">4–6 years · Assignment</option>
              </select>
            </label>
          )}
          {view === "uiux_intern" && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={hideOverqualified}
                onChange={(event) => setHideOverqualified(event.target.checked)}
              />{" "}
              Hide overqualified, &gt;2 yrs
            </label>
          )}
        </div>
        <div className="filter-bar">
          <div className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search candidates"
              placeholder="Search candidates, skills, or education"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <label className="sort-label">
            Sort by
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortField)}
            >
              <option value="score">Match score</option>
              <option value="relevant_exp">Relevant experience</option>
              <option value="total_exp">Total experience</option>
            </select>
          </label>
        </div>
        <p className="result-count muted" role="status">
          {visibleCandidates.length} candidates ·{" "}
          {sort === "score" ? "Highest score first" : "Most experience first"} ·
          Select a candidate to review
        </p>
        <CandidateTable
          candidates={visibleCandidates}
          view={view}
          band={band}
          onSelect={setSelected}
        />
      </main>
      {selected && (
        <CandidateDrawer
          key={selected.candidate_id}
          candidate={selected}
          band={band}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
