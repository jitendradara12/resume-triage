import { useMemo, useRef, useState } from "react";
import { Download, Search, Upload, X } from "lucide-react";
import { CandidateDrawer } from "./CandidateDrawer";
import { CandidateTable } from "./CandidateTable";
import { ExperienceTarget } from "./ExperienceTarget";
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
    hasUploads,
    clearUploads,
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
            {hasUploads && (
              <button
                type="button"
                className="button"
                disabled={isUploading}
                onClick={clearUploads}
                title="Remove test uploads from this browser and restore the 47 original resumes"
              >
                Clear uploads
              </button>
            )}
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
          <summary>How candidates are ranked</summary>
          <ul className="methodology-content">
            <li>
              Every resume is read, broken words from file conversion are
              cleaned without guessing missing facts (each change is shown on the
              Resume tab), and it gets a 0–100 score for each role.
            </li>
            <li>
              <strong>LCA Consultant:</strong> LCA tools &amp; data 40%,
              standards &amp; methods 35%, project depth 25%. Pick the
              experience you want — scores update instantly.
            </li>
            <li>
              <strong>UI/UX Intern:</strong> UI craft 45%, product thinking 40%,
              user research 15%. No penalty for experience, but more than
              2 years in design is marked "Above the internship experience target".
            </li>
            <li>
              Evidence of role requirements can raise or lower the score.
              LCA experience includes sustainability work; overlapping jobs
              count once. Teaching assistantships are excluded from counted experience.
            </li>
            <li>
              Unreadable or very short resumes go to "Check manually" instead
              of being rejected. Scores guide your judgment — they don't make
              the decision.
            </li>
            <li>
              Upload a PDF, Word, or text resume to see where it ranks. Uploads
              are processed on the server and their results are saved in this
              browser. Re-uploading a baseline resume reuses its saved evaluation.
            </li>
            <li>
              Cross-field profiles also appear in their main role list. Their
              badges identify topics in the resume, not qualifications for a
              second role. On combined lists, the larger score determines the
              displayed role and score order.
            </li>
          </ul>
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
              {candidateViews.find((item) => item.id === view)?.description}
            </p>
          </div>
          {view === "lca_consultant" && (
            <ExperienceTarget band={band} onChange={setBand} />
          )}
          {view === "uiux_intern" && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={hideOverqualified}
                onChange={(event) => setHideOverqualified(event.target.checked)}
              />{" "}
              Hide candidates with more than 2 years of design experience
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
              <option value="score">Score</option>
              <option value="relevant_exp">Experience in the displayed field</option>
              <option value="total_exp">Counted career experience</option>
            </select>
          </label>
        </div>
        <p className="result-count muted" role="status">
          {visibleCandidates.length} candidates ·{" "}
          {sort === "score" ? "Highest score first" : "Most experience first"} ·
          Click a candidate to see why
        </p>
        <CandidateTable
          candidates={visibleCandidates}
          view={view}
          band={band}
          onSelect={setSelected}
          filtered={Boolean(query.trim()) || (view === "uiux_intern" && hideOverqualified)}
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
