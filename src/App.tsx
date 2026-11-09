import { useMemo, useRef, useState } from "react";
import { CircleHelp, Download, Search, Upload, X } from "lucide-react";
import { CandidateDrawer } from "./CandidateDrawer";
import { CandidateTable } from "./CandidateTable";
import { ExperienceTarget } from "./ExperienceTarget";
import {
  belongsToView,
  getCandidateView,
  selectCandidates,
  type CandidateView,
  type LcaBand,
  type SortField,
} from "./candidates";
import { exportCandidates } from "./exportCandidates";
import type { EvaluatedCandidate } from "./types";
import { useCandidates } from "./useCandidates";

const primaryRoles: { id: CandidateView; label: string }[] = [
  { id: "lca_consultant", label: "LCA Consultant" },
  { id: "uiux_intern", label: "UI/UX Design Intern" },
];

const secondaryQueues: { id: CandidateView; label: string; warn?: boolean }[] =
  [
    { id: "both", label: "Cross-field" },
    { id: "human_review", label: "Needs review", warn: true },
    { id: "rejected", label: "Not a fit" },
  ];

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
  const [showRules, setShowRules] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const visibleCandidates = useMemo(
    () =>
      selectCandidates(candidates, view, band, query, sort, hideOverqualified),
    [candidates, view, band, query, sort, hideOverqualified],
  );

  const countFor = (id: CandidateView) =>
    candidates.filter((c) => belongsToView(c, id, hideOverqualified)).length;

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="page-width header-content">
          <div className="brand-group">
            <h1>Resume Screening</h1>
            <span className="count-pill">{candidates.length} resumes</span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShowRules((v) => !v)}
              aria-expanded={showRules}
            >
              <CircleHelp size={15} />
              Scoring rules
            </button>
          </div>
          <div className="header-actions">
            {hasUploads && (
              <button
                type="button"
                className="button"
                disabled={isUploading}
                onClick={clearUploads}
                title="Remove uploaded test files and restore original 47 resumes"
              >
                Reset uploads
              </button>
            )}
            <button
              type="button"
              className="button"
              onClick={() => exportCandidates(visibleCandidates, view, band)}
              disabled={visibleCandidates.length === 0}
            >
              <Download size={15} /> Export CSV
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
              <Upload size={15} /> {isUploading ? "Scoring…" : "Upload resume"}
            </button>
          </div>
        </div>
      </header>

      <main className="page-width main-content">
        {showRules && (
          <section className="rules-panel" aria-label="Scoring rules">
            <div className="rules-grid">
              <div>
                <strong>LCA Consultant</strong>
                <p>
                  Scored out of 100 on LCA software (SimaPro, OpenLCA, GaBi),
                  carbon and ISO methods, and real project work.
                </p>
              </div>
              <div>
                <strong>UI/UX Design Intern</strong>
                <p>
                  Scored out of 100 on design craft, product thinking and user
                  research. Anyone with over 2 years of experience gets an
                  “overqualified” tag, not a lower score.
                </p>
              </div>
              <div>
                <strong>Nobody is rejected by mistake</strong>
                <p>
                  Garbled text is fixed and highlighted in the resume view.
                  Unreadable files go to <em>Needs review</em>, never to the
                  reject pile.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setShowRules(false)}
              aria-label="Close scoring rules"
            >
              <X size={16} />
            </button>
          </section>
        )}

        {isUploading && (
          <div className="notice" role="status">
            <span>Extracting and scoring resume…</span>
          </div>
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

        <div className="workspace-card">
          <div
            className="nav-bar"
            role="navigation"
            aria-label="Candidate views"
          >
            <div className="primary-tabs">
              {primaryRoles.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="role-tab"
                  aria-pressed={view === item.id}
                  onClick={() => setView(item.id)}
                >
                  <span>{item.label}</span>
                  <span className="tab-count">{countFor(item.id)}</span>
                </button>
              ))}
            </div>

            <div className="secondary-tabs">
              {secondaryQueues.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`queue-pill ${item.warn ? "warn-pill" : ""}`}
                  aria-pressed={view === item.id}
                  onClick={() => setView(item.id)}
                >
                  {item.warn && (
                    <span className="status-dot" aria-hidden="true" />
                  )}
                  <span>{item.label}</span>
                  <span className="tab-count">{countFor(item.id)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar">
            <div className="toolbar-left">
              <div className="search-field">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search candidates"
                  placeholder="Search skills, education, or ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    className="clear-search"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {view === "lca_consultant" && (
                <ExperienceTarget band={band} onChange={setBand} />
              )}

              {view === "uiux_intern" && (
                <label className="filter-toggle">
                  <input
                    type="checkbox"
                    checked={hideOverqualified}
                    onChange={(event) =>
                      setHideOverqualified(event.target.checked)
                    }
                  />
                  <span>Hide overqualified</span>
                </label>
              )}
            </div>

            <div className="toolbar-right">
              <span className="showing-count">
                {visibleCandidates.length} shown
              </span>
              <label className="sort-label">
                <span>Sort</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortField)}
                >
                  <option value="score">Match score</option>
                  <option value="relevant_exp">Role experience</option>
                  <option value="total_exp">Total experience</option>
                </select>
              </label>
            </div>
          </div>

          <CandidateTable
            candidates={visibleCandidates}
            view={view}
            band={band}
            onSelect={setSelected}
            filtered={
              Boolean(query.trim()) ||
              (view === "uiux_intern" && hideOverqualified)
            }
          />
        </div>
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
