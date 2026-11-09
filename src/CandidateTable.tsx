import {
  displayedRole,
  experienceSummary,
  getRoleScore,
  minimumYears,
  roleLabels,
  type CandidateView,
  type LcaBand,
} from "./candidates";
import {
  crossoverLabel,
  displayName,
  seniorityNote,
  tierLabels,
  triageReason,
} from "./presentation";
import type { EvaluatedCandidate } from "./types";

interface Props {
  candidates: EvaluatedCandidate[];
  view: CandidateView;
  band: LcaBand;
  onSelect: (candidate: EvaluatedCandidate) => void;
}

export function CandidateTable({ candidates, view, band, onSelect }: Props) {
  const mixedRoles = view !== "lca_consultant" && view !== "uiux_intern";
  const triageView = view === "rejected" || view === "human_review";
  const summaryLabel = triageView ? "Why they're here" : "Why this rank";
  return (
    <div
      className="table-wrapper"
      role="region"
      aria-label="Candidate rankings"
      tabIndex={0}
    >
      <table>
        <caption className="sr-only">
          Candidates ranked by the selected score or experience. Open a
          candidate to review their evidence.
        </caption>
        <thead>
          <tr>
            <th scope="col">Candidate</th>
            <th scope="col">{summaryLabel}</th>
            <th scope="col">Experience</th>
            <th scope="col">Score /100</th>
          </tr>
        </thead>
        <tbody>
          {candidates.length === 0 ? (
            <tr>
              <td colSpan={4} className="empty-state">
                No candidates found. Clear the search or change your filters.
              </td>
            </tr>
          ) : (
            candidates.map((candidate, index) => {
              const role = displayedRole(candidate, view, band);
              const evaluation = candidate.evaluations[role];
              const tier = tierLabels[evaluation.match_tier];
              const score = getRoleScore(candidate, role, band);
              const seniority = seniorityNote(candidate, role, minimumYears[band]);
              return (
                <tr
                  key={candidate.candidate_id}
                  onClick={() => onSelect(candidate)}
                >
                  <th scope="row">
                    <div className="candidate-identity">
                      <span className="rank">{index + 1}</span>
                      <div>
                        <button
                          className="candidate-link"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(candidate);
                          }}
                          aria-label={`Review candidate ${displayName(candidate)}`}
                        >
                          {displayName(candidate)}
                        </button>
                        <span
                          className="candidate-file"
                          title={candidate.education_summary}
                        >
                          {candidate.parse_status === "ok" &&
                            candidate.education_summary}
                        </span>
                        {candidate.matched_baseline && (
                          <span className="badge">Already in list</span>
                        )}
                      </div>
                    </div>
                  </th>
                  <td className="candidate-summary" data-label={summaryLabel}>
                    {triageView ? (
                      <p>{triageReason(candidate)}</p>
                    ) : (
                      <>
                        <span className={`pill ${tier.tone}`}>
                          {tier.label}
                          {mixedRoles && ` · ${roleLabels[role]}`}
                        </span>
                        {evaluation.evidence_bullets[0] && (
                          <p className="evidence-snippet">
                            {evaluation.evidence_bullets[0]}
                          </p>
                        )}
                      </>
                    )}
                    {candidate.skills_and_tools.length > 0 && (
                      <p className="muted skill-summary">
                        {candidate.skills_and_tools.slice(0, 4).join(" · ")}
                      </p>
                    )}
                    {!triageView &&
                      (seniority || candidate.crossover_badges.length > 0) && (
                        <div className="candidate-flags">
                          {seniority && (
                            <span className="badge warning">
                              {seniority.label}
                            </span>
                          )}
                          {candidate.crossover_badges.map((badge) => (
                            <span key={badge} className="badge">
                              {crossoverLabel(badge)}
                            </span>
                          ))}
                        </div>
                      )}
                  </td>
                  <td data-label="Experience" className="experience-cell">
                    <strong>{experienceSummary(candidate, role)}</strong>
                    {candidate.total_career_years.toFixed(1) !==
                      (candidate.relevant_years_by_domain[role] ?? 0).toFixed(1) && (
                      <span className="muted">
                        of {candidate.total_career_years.toFixed(1)} yrs total
                      </span>
                    )}
                  </td>
                  <td data-label="Score /100" className="score-cell">
                    <strong className={`score ${tier.tone}`}>
                      {Math.round(score)}
                    </strong>
                    {mixedRoles && (
                      <span className="muted">
                        LCA {Math.round(getRoleScore(candidate, "lca_consultant", band))}{" "}
                        · UI/UX{" "}
                        {Math.round(getRoleScore(candidate, "uiux_intern", band))}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
