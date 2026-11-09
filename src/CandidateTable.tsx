import { ChevronRight } from "lucide-react";
import {
  displayedRole,
  getRoleScore,
  minimumYears,
  roleLabels,
  type CandidateView,
  type LcaBand,
} from "./candidates";
import {
  cleanSnippet,
  crossoverLabel,
  displayName,
  fitTier,
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
  filtered: boolean;
}

export function CandidateTable({
  candidates,
  view,
  band,
  onSelect,
  filtered,
}: Props) {
  const mixedRoles = view !== "lca_consultant" && view !== "uiux_intern";
  const triageView = view === "rejected" || view === "human_review";

  return (
    <div
      className="table-wrapper"
      role="region"
      aria-label="Candidate rankings"
    >
      <table>
        <caption className="sr-only">
          Candidates ranked by match score or experience. Select any row to
          inspect the full evaluation and resume.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="col-candidate">
              Candidate
            </th>
            <th scope="col" className="col-evidence">
              {triageView ? "Why" : "Skills & evidence"}
            </th>
            <th scope="col" className="col-exp">
              Role experience
            </th>
            <th scope="col" className="col-score">
              Match / 100
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.length === 0 ? (
            <tr>
              <td colSpan={4} className="empty-state">
                {filtered
                  ? "No candidates match your filter. Try clearing the search box."
                  : "No candidates in this queue."}
              </td>
            </tr>
          ) : (
            candidates.map((candidate, index) => {
              const role = displayedRole(candidate, view, band);
              const evaluation = candidate.evaluations[role];
              const score = getRoleScore(candidate, role, band);
              const tier = tierLabels[fitTier(evaluation, score)];
              const seniority = seniorityNote(
                candidate,
                role,
                minimumYears[band],
              );
              const relYears = candidate.relevant_years_by_domain[role] ?? 0;
              const totalYears = candidate.total_career_years;
              const skills = candidate.skills_and_tools.slice(0, 3);
              const extraSkills = Math.max(
                0,
                candidate.skills_and_tools.length - skills.length,
              );
              const snippet = cleanSnippet(evaluation.evidence_bullets[0]);
              const name = displayName(candidate);

              return (
                <tr
                  key={candidate.candidate_id}
                  onClick={() => onSelect(candidate)}
                >
                  <th scope="row" className="col-candidate">
                    <div className="candidate-identity">
                      <span className="rank-badge">{index + 1}</span>
                      <div className="identity-text">
                        <div className="identity-name-row">
                          <button
                            type="button"
                            className="candidate-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect(candidate);
                            }}
                            aria-label={`Review candidate ${name}`}
                          >
                            {name}
                          </button>
                          {candidate.matched_baseline && (
                            <span className="chip chip-info">
                              Baseline match
                            </span>
                          )}
                        </div>
                        <span
                          className="candidate-edu"
                          title={candidate.education_summary}
                        >
                          {candidate.parse_status === "ok"
                            ? candidate.education_summary || candidate.filename
                            : candidate.filename}
                        </span>
                      </div>
                    </div>
                  </th>

                  <td
                    className="col-evidence"
                    data-label={triageView ? "Status" : "Skills & evidence"}
                  >
                    {skills.length > 0 && (
                      <div className="skill-chips">
                        {skills.map((skill) => (
                          <span key={skill} className="skill-chip">
                            {skill}
                          </span>
                        ))}
                        {extraSkills > 0 && (
                          <span className="skill-chip more">
                            +{extraSkills}
                          </span>
                        )}
                      </div>
                    )}

                    {triageView ? (
                      <p className="evidence-line triage-text">
                        {triageReason(candidate)}
                      </p>
                    ) : (
                      snippet && <p className="evidence-line">{snippet}</p>
                    )}

                    {!triageView &&
                      (mixedRoles ||
                        seniority ||
                        candidate.crossover_badges.length > 0) && (
                        <div className="row-flags">
                          {mixedRoles && (
                            <span className="chip chip-role">
                              {roleLabels[role]}
                            </span>
                          )}
                          {seniority && (
                            <span className="chip chip-warn">
                              {seniority.label}
                            </span>
                          )}
                          {candidate.crossover_badges
                            .slice(0, 2)
                            .map((badge) => (
                              <span key={badge} className="chip">
                                {crossoverLabel(badge)}
                              </span>
                            ))}
                        </div>
                      )}
                  </td>

                  <td data-label="Experience" className="col-exp">
                    <div className="exp-stack">
                      <strong className="exp-years">
                        {relYears.toFixed(1)} yrs
                      </strong>
                      <span className="exp-domain">
                        {role === "lca_consultant" ? "in LCA" : "in UI/UX"}
                      </span>
                      {totalYears.toFixed(1) !== relYears.toFixed(1) &&
                        totalYears > 0 && (
                          <span className="exp-total">
                            {totalYears.toFixed(1)} yrs total
                          </span>
                        )}
                    </div>
                  </td>

                  <td data-label="Score" className="col-score">
                    <div className="score-cluster">
                      <div className="score-main">
                        <div className={`score-num table-score ${tier.tone}`}>
                          <strong className="score-value">{Math.round(score)}</strong>
                          <span className="score-label">{tier.label}</span>
                        </div>
                        {mixedRoles && (
                          <span className="dual-scores">
                            LCA {Math.round(getRoleScore(candidate, "lca_consultant", band))}
                            {" · UX "}
                            {Math.round(getRoleScore(candidate, "uiux_intern", band))}
                          </span>
                        )}
                      </div>
                      <ChevronRight
                        size={16}
                        className="row-chevron"
                        aria-hidden="true"
                      />
                    </div>
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
