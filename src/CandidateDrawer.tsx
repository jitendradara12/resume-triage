import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import {
  experienceSummary,
  getRoleScore,
  minimumYears,
  roleLabels,
  type LcaBand,
  type Role,
} from "./candidates";
import {
  cleanSnippet,
  criterionLabels,
  crossoverLabel,
  displayName,
  formatMonth,
  fitTier,
  requirementChecks,
  seniorityNote,
  tierLabels,
  triageReason,
} from "./presentation";
import type { EvaluatedCandidate, ForensicRepair } from "./types";

function ResumeText({
  text,
  repairs,
}: {
  text: string;
  repairs: ForensicRepair[];
}) {
  if (!text) return null;
  const values = [
    ...new Set(repairs.map((repair) => repair.repaired_value).filter(Boolean)),
  ];
  const pattern = values
    .sort((a, b) => b.length - a.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const parts = pattern ? text.split(new RegExp(`(${pattern})`, "g")) : [text];
  return (
    <pre className="resume-text">
      {parts.map((part, index) => {
        const repair = repairs.find((item) => item.repaired_value === part);
        return repair ? (
          <mark
            key={index}
            title={`Original: ${repair.raw_fragment}. ${repair.reason}`}
          >
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        );
      })}
    </pre>
  );
}

function RoleEvaluation({
  candidate,
  role,
  band,
  compact,
}: {
  candidate: EvaluatedCandidate;
  role: Role;
  band: LcaBand;
  compact: boolean;
}) {
  const evaluation = candidate.evaluations[role];
  const score = getRoleScore(candidate, role, band);
  const tier = tierLabels[fitTier(evaluation, score)];
  const seniority = seniorityNote(candidate, role, minimumYears[band]);
  return (
    <section
      className={`role-evaluation ${compact ? "compact" : ""}`}
      data-tone={tier.tone}
    >
      <div className="role-heading">
        <div>
          <h3>{roleLabels[role]}</h3>
          <p className="muted">{experienceSummary(candidate, role)}</p>
          {seniority && (
            <span className="chip chip-warn drawer-chip">{seniority.label}</span>
          )}
        </div>
        <div className="role-score">
          <strong className={`score-num ${tier.tone}`}>
            {Math.round(score)}
          </strong>
          <span className={`pill ${tier.tone}`}>{tier.label}</span>
        </div>
      </div>

      {!compact && evaluation.match_tier !== "mismatch" && (
        <div className="rubric-breakdown">
          {Object.entries(evaluation.sub_scores).map(([key, value]) => (
            <div className="rubric-score" key={key}>
              <div>
                <span>{criterionLabels[key] ?? key.replaceAll("_", " ")}</span>
                <strong>{Math.round(value)}/100</strong>
              </div>
              <meter
                min={0}
                max={100}
                value={value}
                aria-label={criterionLabels[key] ?? key}
              >
                {Math.round(value)}
              </meter>
            </div>
          ))}
        </div>
      )}

      <ul className="check-list">
        {requirementChecks(evaluation).map((check) => (
          <li key={check.key} className={check.passed ? "passed" : "failed"}>
            {check.passed ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <X size={14} aria-hidden="true" />
            )}
            {check.label}
          </li>
        ))}
      </ul>

      {!compact && evaluation.evidence_bullets.length > 0 && (
        <div className="role-evidence">
          <h4>From the resume</h4>
          <ul className="evidence-list">
            {evaluation.evidence_bullets.map((evidence, index) => (
              <li key={index}>{cleanSnippet(evidence) || evidence}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function CandidateDrawer({
  candidate,
  band,
  onClose,
}: {
  candidate: EvaluatedCandidate;
  band: LcaBand;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState<"summary" | "resume" | "history">("summary");

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.setAttribute("closedby", "any");
      element.showModal();
    }
  }, []);

  const classification = candidate.primary_classification;
  const triaged =
    candidate.needs_human_review || classification === "neither_uncertain";
  const isCompact = (role: Role) =>
    (classification === "lca_consultant" || classification === "uiux_intern") &&
    classification !== role;
  const roles = (["lca_consultant", "uiux_intern"] as const)
    .slice()
    .sort((a, b) => Number(isCompact(a)) - Number(isCompact(b)));

  return (
    <dialog
      ref={dialog}
      className="candidate-drawer"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          event.currentTarget.close();
      }}
    >
      <div className="drawer-layout">
        <header className="drawer-header">
          <div className="section-heading">
            <div className="drawer-identity">
              <h2 id={titleId}>{displayName(candidate)}</h2>
              <span className="file-path-text" title={`File: ${candidate.filename}`}>
                {candidate.filename}
              </span>
              {candidate.matched_baseline && (
                <span className="chip chip-info">Baseline match</span>
              )}
              {candidate.crossover_badges.map((badge) => (
                <span key={badge} className="chip">
                  {crossoverLabel(badge)}
                </span>
              ))}
            </div>
            <div className="drawer-header-actions">
              {candidate.source_url && (
                <a
                  href={candidate.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="button button-sm"
                  title={candidate.filename}
                >
                  <ExternalLink size={13} />{" "}
                  {candidate.source_url.includes("/folder/")
                    ? "Source folder"
                    : "Source file"}
                </a>
              )}
              <button
                type="button"
                className="icon-button"
                onClick={() => dialog.current?.close()}
                aria-label="Close candidate details"
                autoFocus
              >
                <X size={18} />
              </button>
            </div>
          </div>
          {candidate.parse_status === "ok" && candidate.education_summary && (
            <p className="muted drawer-edu">{candidate.education_summary}</p>
          )}
        </header>

        <nav className="drawer-nav" aria-label="Candidate details">
          {(["summary", "resume", "history"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
            >
              {
                {
                  summary: "Summary",
                  resume: "Resume",
                  history: "Work history",
                }[item]
              }
            </button>
          ))}
        </nav>

        <div className="drawer-body">
          {tab === "summary" && (
            <>
              {triaged && (
                <section className="profile-summary warning">
                  <h3>
                    {candidate.needs_human_review
                      ? "Needs a human look"
                      : "Not a fit for either role"}
                  </h3>
                  <p>{triageReason(candidate)}</p>
                </section>
              )}

              <div
                className={`role-comparison ${roles.some(isCompact) ? "stacked" : ""}`}
              >
                {roles.map((role) => (
                  <RoleEvaluation
                    key={role}
                    candidate={candidate}
                    role={role}
                    band={band}
                    compact={isCompact(role)}
                  />
                ))}
              </div>

              {(candidate.skills_and_tools.length > 0 ||
                candidate.key_projects_and_roles.length > 0) && (
                <section className="profile-details">
                  <h4>Skills</h4>
                  {candidate.skills_and_tools.length > 0 && (
                    <div className="skill-chips drawer-skills">
                      {candidate.skills_and_tools.map((skill) => (
                        <span key={skill} className="skill-chip">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  {candidate.key_projects_and_roles.length > 0 && (
                    <ul className="evidence-list">
                      {candidate.key_projects_and_roles.map((project, index) => (
                        <li key={index}>{project}</li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}

          {tab === "resume" && (
            <>
              {candidate.parse_status !== "ok" ? (
                <div className="notice warning" role="status">
                  {triageReason(candidate)}
                </div>
              ) : candidate.forensic_repairs.length > 0 ? (
                <details className="repair-details">
                  <summary>
                    {candidate.forensic_repairs.length} text cleanups highlighted
                    below
                  </summary>
                  <ul className="repair-list">
                    {candidate.forensic_repairs.map((repair, index) => (
                      <li key={index}>
                        <p>
                          <del>{repair.raw_fragment}</del> →{" "}
                          <strong>{repair.repaired_value}</strong>
                        </p>
                        <p className="muted">{repair.reason}</p>
                      </li >
                    ))}
                  </ul>
                </details>
              ) : null}
              <ResumeText
                text={candidate.healed_text}
                repairs={candidate.forensic_repairs}
              />
            </>
          )}

          {tab === "history" && (
            <>
              <section className="exp-summary-cards">
                <div className="exp-stat-card">
                  <span>Total career</span>
                  <strong>{candidate.total_career_years.toFixed(1)} yrs</strong>
                </div>
                <div className="exp-stat-card">
                  <span>Sustainability / LCA</span>
                  <strong>
                    {(
                      candidate.relevant_years_by_domain.lca_consultant ?? 0
                    ).toFixed(1)}{" "}
                    yrs
                  </strong>
                </div>
                <div className="exp-stat-card">
                  <span>UI/UX Design</span>
                  <strong>
                    {(
                      candidate.relevant_years_by_domain.uiux_intern ?? 0
                    ).toFixed(1)}{" "}
                    yrs
                  </strong>
                </div>
              </section>

              <section>
                {candidate.work_spans.length === 0 ? (
                  <p className="muted">
                    No dated work spans extracted. Check the Resume tab for
                    projects or coursework.
                  </p>
                ) : (
                  <ul className="work-history">
                    {candidate.work_spans.map((span, index) => (
                      <li key={index}>
                        <div className="work-span-top">
                          <h4>{span.title}</h4>
                          <span className="chip">
                            {
                              {
                                lca_sustainability: "Sustainability",
                                uiux_design: "Design",
                                other: "Other",
                              }[span.domain]
                            }
                            {span.is_internship ? " · Intern" : ""}
                          </span>
                        </div>
                        <p>{span.organization}</p>
                        <p className="muted">
                          {formatMonth(span.start_date)} –{" "}
                          {formatMonth(span.end_date)} ({span.months_duration}{" "}
                          mos)
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
