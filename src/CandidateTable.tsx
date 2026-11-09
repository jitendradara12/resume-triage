import {
  displayedRole,
  getRoleScore,
  roleLabels,
  type CandidateView,
  type LcaBand,
} from "./candidates";
import type { EvaluatedCandidate } from "./types";

interface Props {
  candidates: EvaluatedCandidate[];
  view: CandidateView;
  band: LcaBand;
  onSelect: (candidate: EvaluatedCandidate) => void;
}

export function CandidateTable({ candidates, view, band, onSelect }: Props) {
  const mixedRoles = view !== "lca_consultant" && view !== "uiux_intern";
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
            <th scope="col">Why they match</th>
            <th scope="col">Experience</th>
            <th scope="col">Score / 100</th>
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
              const years = candidate.relevant_years_by_domain[role] ?? 0;
              const belowTarget =
                role === "lca_consultant" &&
                years < (band === "jd_2_3y" ? 2 : 4);
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
                          aria-label={`Review candidate ${candidate.initials_or_alias}, ${candidate.filename}`}
                        >
                          {candidate.initials_or_alias}
                        </button>
                        <span
                          className="candidate-file"
                          title={candidate.filename}
                        >
                          {candidate.filename}
                        </span>
                        {candidate.matched_baseline && (
                          <span className="badge">Baseline match</span>
                        )}
                      </div>
                    </div>
                  </th>
                  <td className="candidate-summary" data-label="Why they match">
                    {mixedRoles && (
                      <span className="role-label">{roleLabels[role]}</span>
                    )}
                    <p>
                      {candidate.needs_human_review
                        ? candidate.classification_reason
                        : evaluation.rationale_headline}
                    </p>
                    {candidate.skills_and_tools.length > 0 && (
                      <p className="muted skill-summary">
                        {candidate.skills_and_tools.slice(0, 4).join(" · ")}
                      </p>
                    )}
                    <div className="candidate-flags">
                      {candidate.needs_human_review ? (
                        <span className="badge warning">Needs review</span>
                      ) : evaluation.seniority_flag === "overqualified" ? (
                        <span className="badge warning">Overqualified</span>
                      ) : belowTarget ? (
                        <span className="badge">Below experience target</span>
                      ) : null}
                      {candidate.forensic_repairs.length > 0 && (
                        <span className="badge">Text repaired</span>
                      )}
                      {candidate.crossover_badges.length > 0 && (
                        <span className="badge">Domain crossover</span>
                      )}
                    </div>
                  </td>
                  <td data-label="Experience" className="experience-cell">
                    <strong>{years.toFixed(1)} yrs relevant</strong>
                    <span className="muted">
                      {candidate.total_career_years.toFixed(1)} yrs total
                    </span>
                  </td>
                  <td data-label="Score / 100" className="score-cell">
                    <strong
                      className={`score ${getRoleScore(candidate, role, band) >= 65 ? "strong-score" : ""}`}
                    >
                      {getRoleScore(candidate, role, band).toFixed(1)}
                    </strong>
                    {mixedRoles && (
                      <span className="muted">
                        LCA{" "}
                        {getRoleScore(
                          candidate,
                          "lca_consultant",
                          band,
                        ).toFixed(1)}{" "}
                        · UI/UX{" "}
                        {getRoleScore(candidate, "uiux_intern", band).toFixed(
                          1,
                        )}
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
