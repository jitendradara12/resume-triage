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
    <section className={`role-evaluation ${compact ? "compact" : ""}`}>
      <div className="role-heading">
        <div>
          <h3>{roleLabels[role]}</h3>
          <p className="muted">{experienceSummary(candidate, role)}</p>
          {seniority && (
            <span className="badge warning">{seniority.label}</span>
          )}
        </div>
        <div className="role-score">
          <strong className={`score ${tier.tone}`}>
            {Math.round(score)}
          </strong>
          <span className={`pill ${tier.tone}`}>{tier.label}</span>
        </div>
      </div>
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
              <li key={index}>{evidence}</li>
            ))}
          </ul>
        </div>
      )}
      {!compact && evaluation.match_tier !== "mismatch" && (
        <details className="rubric-breakdown">
          <summary>How the score adds up</summary>
          <p className="muted">
            Each part is scored 0–100 and weighted. Evidence of requirements can
            raise or lower the total. LCA scores also account for the selected
            experience target.
          </p>
          {Object.entries(evaluation.sub_scores).map(([key, value]) => (
            <div className="rubric-score" key={key}>
              <div>
                <span>{criterionLabels[key] ?? key.replaceAll("_", " ")}</span>
                <strong>{Math.round(value)}</strong>
              </div>
              <meter min={0} max={100} value={value} aria-label={criterionLabels[key] ?? key}>
                {Math.round(value)}
              </meter>
            </div>
          ))}
        </details>
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
              {candidate.matched_baseline && (
                <span className="badge">Already in list</span>
              )}
            </div>
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
          <p className="muted">{candidate.parse_status === "ok" && candidate.education_summary}</p>
          {candidate.source_url && (
            <a
              href={candidate.source_url}
              target="_blank"
              rel="noreferrer"
              className="source-link"
              title={candidate.filename}
            >
              <ExternalLink size={14} /> {candidate.source_url.includes("/folder/") ? "Open source folder" : "Open original resume"}
            </a>
          )}
          <p className="candidate-file">{candidate.filename}</p>
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
              {(triaged ||
                classification === "both" ||
                candidate.crossover_badges.length > 0) && (
              <section className={`profile-summary ${triaged ? "warning" : ""}`}>
                <h3>
                  {candidate.needs_human_review
                    ? "Check this one manually"
                    : classification === "both"
                      ? "Fits both roles"
                      : classification === "neither_uncertain"
                        ? "Low match for both roles"
                        : `Best fit: ${roleLabels[classification]}`}
                </h3>
                {candidate.needs_human_review && <p>{triageReason(candidate)}</p>}
                {candidate.crossover_badges.map((badge) => (
                  <p key={badge} className="muted">
                    {crossoverLabel(badge)}.
                  </p>
                ))}
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
                <details className="profile-details">
                  <summary>All skills and projects</summary>
                  <p className="muted">
                    {candidate.skills_and_tools.join(" · ")}
                  </p>
                  <ul className="evidence-list">
                    {candidate.key_projects_and_roles.map((project, index) => (
                      <li key={index}>{project}</li>
                    ))}
                  </ul>
                </details>
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
                    below. Missing facts are marked unreadable, not guessed.
                  </summary>
                  <ul className="repair-list">
                    {candidate.forensic_repairs.map((repair, index) => (
                      <li key={index}>
                        <p>
                          <del>{repair.raw_fragment}</del> →{" "}
                          <strong>{repair.repaired_value}</strong>
                        </p>
                        <p className="muted">{repair.reason}</p>
                      </li>
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
              <section>
                <dl className="value-list">
                  <div>
                    <dt>Counted career experience</dt>
                    <dd>{candidate.total_career_years.toFixed(1)} yrs</dd>
                  </div>
                  {(["lca_consultant", "uiux_intern"] as const).map((role) => (
                    <div key={role}>
                      <dt>
                        {role === "lca_consultant"
                          ? "Sustainability / LCA"
                          : "UI/UX design"}
                      </dt>
                      <dd>
                        {(
                          candidate.relevant_years_by_domain[role] ?? 0
                        ).toFixed(1)}{" "}
                        yrs
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="muted">
                  Overlapping jobs are counted once. Teaching assistantships
                  are excluded from these totals. Sustainability / LCA includes
                  adjacent environmental work.
                </p>
              </section>
              <section>
                {candidate.work_spans.length === 0 ? (
                  <p className="muted">
                    No work history extracted. Check the resume for roles,
                    projects, or student work.
                  </p>
                ) : (
                  <ul className="work-history">
                    {candidate.work_spans.map((span, index) => (
                      <li key={index}>
                        <h4>{span.title}</h4>
                        <p>{span.organization}</p>
                        <p className="muted">
                          {formatMonth(span.start_date)} –{" "}
                          {formatMonth(span.end_date)} ·{" "}
                          {span.months_duration} months ·{" "}
                          {
                            {
                              lca_sustainability: "Sustainability",
                              uiux_design: "Design",
                              other: "Other field",
                            }[span.domain]
                          }
                          {span.is_internship && " · Internship"}
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
