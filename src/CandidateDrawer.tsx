import { Fragment, useEffect, useId, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import {
  getRoleScore,
  roleLabels,
  type LcaBand,
  type Role,
} from "./candidates";
import type { EvaluatedCandidate, ForensicRepair } from "./types";

const criterionLabels: Record<string, string> = {
  software_and_data_mastery: "Software and data",
  methodology_and_standards: "Methods and standards",
  project_depth: "Project depth",
  ui_craft_and_systems: "UI craft and systems",
  ux_research_methods: "UX research",
  product_thinking: "Product thinking",
  has_lca_software: "Hands-on LCA software",
  has_ghg_standards: "GHG and ISO knowledge",
  is_unrelated_domain: "Unrelated background",
  has_figma_wireframing: "Figma and wireframing",
  has_portfolio_projects: "Portfolio projects",
  is_pure_graphic_or_unrelated: "Graphic design only or unrelated",
};

function ResumeText({
  text,
  repairs,
}: {
  text: string;
  repairs: ForensicRepair[];
}) {
  if (!text)
    return (
      <p className="muted">
        No readable text could be extracted. Please inspect the source resume.
      </p>
    );
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
}: {
  candidate: EvaluatedCandidate;
  role: Role;
  band: LcaBand;
}) {
  const evaluation = candidate.evaluations[role];
  const years = candidate.relevant_years_by_domain[role] ?? 0;
  const belowTarget =
    role === "lca_consultant" && years < (band === "jd_2_3y" ? 2 : 4);
  const seniority =
    evaluation.seniority_flag === "overqualified"
      ? "Overqualified"
      : belowTarget
        ? "Below target"
        : role === "lca_consultant"
          ? "Meets minimum"
          : "Intern range";
  return (
    <section className="role-evaluation">
      <div className="role-heading">
        <div>
          <h3>{roleLabels[role]}</h3>
          <p className="muted">
            {years.toFixed(1)} yrs relevant · {seniority}
          </p>
        </div>
        <div className="role-score">
          <strong className="score">
            {getRoleScore(candidate, role, band).toFixed(1)}
          </strong>
          <span className="match-tier">
            {evaluation.match_tier.replaceAll("_", " ")}
          </span>
        </div>
      </div>
      {role === "lca_consultant" && (
        <div className="score-variants">
          <span>
            2–3 yrs:{" "}
            <strong>
              {getRoleScore(candidate, role, "jd_2_3y").toFixed(1)}
            </strong>
          </span>
          <span>
            4–6 yrs:{" "}
            <strong>
              {getRoleScore(candidate, role, "prompt_4_6y").toFixed(1)}
            </strong>
          </span>
        </div>
      )}
      <p>{evaluation.rationale_headline}</p>
      <div className="rubric-breakdown">
        <h4>Score breakdown</h4>
        {Object.entries(evaluation.sub_scores).map(([key, value]) => (
          <div className="rubric-score" key={key}>
            <div>
              <span>{criterionLabels[key] ?? key.replaceAll("_", " ")}</span>
              <strong>{value.toFixed(1)} / 100</strong>
            </div>
            <meter
              min={0}
              max={100}
              value={value}
              aria-label={criterionLabels[key] ?? key.replaceAll("_", " ")}
            >
              {value.toFixed(1)}
            </meter>
          </div>
        ))}
      </div>
      <div className="role-requirements">
        <h4>Role requirements</h4>
        <dl className="value-list">
          {Object.entries(evaluation.gate_probabilities).map(([key, value]) => (
            <div key={key}>
              <dt>{criterionLabels[key] ?? key.replaceAll("_", " ")}</dt>
              <dd>{(value * 100).toFixed(1)}%</dd>
            </div>
          ))}
        </dl>
        <p className="muted confidence-note">
          Model confidence: {(evaluation.jev_confidence * 100).toFixed(0)}%
        </p>
      </div>
      {evaluation.evidence_bullets.length > 0 && (
        <div className="role-evidence">
          <h4>Evidence</h4>
          <ul className="evidence-list">
            {evaluation.evidence_bullets.map((evidence, index) => (
              <li key={index}>{evidence}</li>
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
  const [tab, setTab] = useState<"evaluation" | "resume" | "experience">(
    "evaluation",
  );
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.setAttribute("closedby", "any");
      element.showModal();
    }
  }, []);

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
              <h2 id={titleId}>Candidate {candidate.initials_or_alias}</h2>
              <span className="muted filename">{candidate.filename}</span>
              <span className="badge">
                {candidate.word_count} words ·{" "}
                {candidate.parse_status === "ok" ? "Readable" : "Needs review"}
              </span>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => dialog.current?.close()}
              aria-label="Close candidate drawer"
              autoFocus
            >
              <X size={18} />
            </button>
          </div>
          <p className="muted">{candidate.education_summary}</p>
          {candidate.source_url && (
            <a
              href={candidate.source_url}
              target="_blank"
              rel="noreferrer"
              className="source-link"
            >
              <ExternalLink size={14} /> Source folder
            </a>
          )}
        </header>
        <nav className="drawer-nav" aria-label="Candidate details">
          {(["evaluation", "resume", "experience"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
            >
              {
                {
                  evaluation: "Evaluation",
                  resume: "Resume",
                  experience: "Experience",
                }[item]
              }
            </button>
          ))}
        </nav>
        <div className="drawer-body">
          {candidate.parse_status !== "ok" && (
            <div className="notice warning" role="status">
              {candidate.parse_diagnostics ||
                "The resume could not be read. Please inspect the source file."}
            </div>
          )}
          {tab === "evaluation" && (
            <>
              <section className="profile-summary">
                <h3>
                  {candidate.needs_human_review
                    ? "Needs human review"
                    : candidate.primary_classification === "both"
                      ? "Matches both roles"
                      : candidate.primary_classification === "neither_uncertain"
                        ? "Neither role"
                        : roleLabels[candidate.primary_classification]}
                </h3>
                <p className="muted">{candidate.classification_reason}</p>
                {candidate.crossover_badges.map((badge) => (
                  <p key={badge} className="crossover-note">
                    {badge}
                  </p>
                ))}
              </section>
              <div className="role-comparison">
                {(["lca_consultant", "uiux_intern"] as const).map((role) => (
                  <RoleEvaluation
                    key={role}
                    candidate={candidate}
                    role={role}
                    band={band}
                  />
                ))}
              </div>
              {(candidate.skills_and_tools.length > 0 ||
                candidate.key_projects_and_roles.length > 0) && (
                <details className="profile-details">
                  <summary>Skills and projects</summary>
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
              {candidate.forensic_repairs.length > 0 ? (
                <details className="repair-details">
                  <summary>
                    {candidate.forensic_repairs.length} text repairs. Changes
                    are highlighted below.
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
              ) : (
                <p className="muted">No text repairs recorded.</p>
              )}
              <ResumeText
                text={candidate.healed_text}
                repairs={candidate.forensic_repairs}
              />
            </>
          )}
          {tab === "experience" && (
            <>
              <section>
                <h3>How experience is counted</h3>
                <p className="muted">
                  Overlapping roles count once within each domain and across the
                  full career. Teaching assistantships are excluded from
                  industry LCA experience.
                </p>
                <dl className="value-list">
                  <div>
                    <dt>Total career</dt>
                    <dd>{candidate.total_career_years.toFixed(1)} yrs</dd>
                  </div>
                  {(["lca_consultant", "uiux_intern"] as const).map((role) => (
                    <div key={role}>
                      <dt>{roleLabels[role]}</dt>
                      <dd>
                        {(
                          candidate.relevant_years_by_domain[role] ?? 0
                        ).toFixed(1)}{" "}
                        yrs
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section>
                <h3>Work history</h3>
                {candidate.work_spans.length === 0 ? (
                  <p className="muted">
                    No employment dates extracted. Review the resume for project
                    or student experience.
                  </p>
                ) : (
                  <ul className="work-history">
                    {candidate.work_spans.map((span, index) => (
                      <li key={index}>
                        <h4>{span.title}</h4>
                        <p>{span.organization}</p>
                        <p className="muted">
                          {span.start_date || "Start unknown"} →{" "}
                          {span.end_date || "End unknown"} ·{" "}
                          {span.months_duration} months
                        </p>
                        <p className="muted">
                          {
                            {
                              lca_sustainability: "LCA / sustainability",
                              uiux_design: "UI/UX design",
                              other: "Other field",
                            }[span.domain]
                          }{" "}
                          ·{" "}
                          {span.is_internship
                            ? "Internship / assistantship"
                            : "Employment / freelance"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <details>
                <summary>Document reference</summary>
                <p className="document-hash">
                  SHA-256: {candidate.content_hash}
                </p>
                <p className="muted">{candidate.word_count} extracted words</p>
              </details>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
