import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Search,
  ShieldAlert,
  Sparkles,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import baselineData from "../data/baseline_candidates.json";
import { EvaluatedCandidate, ForensicRepair } from "./types";

type ActiveTab = "lca_consultant" | "uiux_intern" | "both" | "human_review" | "rejected";
type LcaBand = "jd_2_3y" | "prompt_4_6y";
type SortField = "score" | "relevant_exp" | "total_exp" | "repairs";

function renderHighlightedText(text: string, repairs: ForensicRepair[]) {
  if (!text) return <span className="italic text-[var(--muted)]">Zero extractable text in document.</span>;
  if (!repairs || repairs.length === 0) {
    return <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--ink)]">{text}</pre>;
  }

  // Highlight each repaired_value in the healed text with a tooltip of raw_fragment + reason
  const validRepairs = repairs.filter((r) => r.repaired_value && text.includes(r.repaired_value));
  if (validRepairs.length === 0) {
    return <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--ink)]">{text}</pre>;
  }

  // Build regex matching any unique repaired_value
  const escaped = Array.from(
    new Set(
      validRepairs
        .map((r) => r.repaired_value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .filter(Boolean)
    )
  ).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(pattern);

  return (
    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--ink)]">
      {parts.map((part, idx) => {
        const matchRepair = validRepairs.find((r) => r.repaired_value === part);
        if (matchRepair) {
          return (
            <mark
              key={idx}
              title={`Original: "${matchRepair.raw_fragment}" — ${matchRepair.reason}`}
              aria-label={`Forensic repair: was "${matchRepair.raw_fragment}". ${matchRepair.reason}`}
              className="rounded px-1 py-0.5 font-semibold bg-[var(--warn-soft)] text-[var(--ink)] border border-[var(--warn)] cursor-help"
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </pre>
  );
}

export function App() {
  const [candidates, setCandidates] = useState<EvaluatedCandidate[]>(
    () => baselineData as unknown as EvaluatedCandidate[]
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>("lca_consultant");
  const [lcaBand, setLcaBand] = useState<LcaBand>("jd_2_3y");
  const [hideOverqualifiedUiux, setHideOverqualifiedUiux] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("score");
  const [selectedCandidate, setSelectedCandidate] = useState<EvaluatedCandidate | null>(null);
  const [drawerTab, setDrawerTab] = useState<"evaluation" | "resume" | "methodology">("evaluation");

  // Upload state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadNotice, setUploadNotice] = useState<{
    message: string;
    matchedBaseline: boolean;
    candidateId: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tableCaptionId = useId();
  const drawerTitleId = useId();

  // Open / close native modal dialog and attach Safari closedby fallback
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (selectedCandidate) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [selectedCandidate]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.setAttribute("closedby", "any");

    const handleClose = () => setSelectedCandidate(null);
    dialog.addEventListener("close", handleClose);

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      dialog.close();
    };
    dialog.addEventListener("click", handleBackdropClick);

    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, []);

  const getRoleScore = (c: EvaluatedCandidate, role: "lca_consultant" | "uiux_intern"): number => {
    const ev = c.evaluations[role];
    if (!ev) return 0;
    if (role === "lca_consultant") {
      return ev.score_variants?.[lcaBand] ?? ev.overall_score;
    }
    return ev.overall_score;
  };

  // Counts per tab
  const counts = useMemo(() => {
    const lca = candidates.filter(
      (c) =>
        (c.primary_classification === "lca_consultant" || c.primary_classification === "both") &&
        !c.needs_human_review
    ).length;
    const uiux = candidates.filter((c) => {
      const inBucket =
        (c.primary_classification === "uiux_intern" || c.primary_classification === "both") &&
        !c.needs_human_review;
      if (!inBucket) return false;
      if (hideOverqualifiedUiux && c.evaluations.uiux_intern.seniority_flag === "overqualified") {
        return false;
      }
      return true;
    }).length;
    const both = candidates.filter(
      (c) => (c.primary_classification === "both" || c.crossover_badges.length > 0) && !c.needs_human_review
    ).length;
    const humanReview = candidates.filter((c) => c.needs_human_review).length;
    const rejected = candidates.filter(
      (c) => c.primary_classification === "neither_uncertain" && !c.needs_human_review
    ).length;
    const repairedTotal = candidates.filter((c) => c.forensic_repairs.length > 0).length;
    return { lca, uiux, both, humanReview, rejected, repairedTotal };
  }, [candidates, hideOverqualifiedUiux]);

  const activeRoleForDisplay: "lca_consultant" | "uiux_intern" =
    activeTab === "uiux_intern" ? "uiux_intern" : "lca_consultant";

  const filteredCandidates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = candidates.filter((c) => {
      if (activeTab === "lca_consultant") {
        if (
          (c.primary_classification !== "lca_consultant" && c.primary_classification !== "both") ||
          c.needs_human_review
        )
          return false;
      } else if (activeTab === "uiux_intern") {
        if (
          (c.primary_classification !== "uiux_intern" && c.primary_classification !== "both") ||
          c.needs_human_review
        )
          return false;
        if (hideOverqualifiedUiux && c.evaluations.uiux_intern.seniority_flag === "overqualified") {
          return false;
        }
      } else if (activeTab === "both") {
        if (
          (c.primary_classification !== "both" && c.crossover_badges.length === 0) ||
          c.needs_human_review
        )
          return false;
      } else if (activeTab === "human_review") {
        if (!c.needs_human_review) return false;
      } else if (activeTab === "rejected") {
        if (c.primary_classification !== "neither_uncertain" || c.needs_human_review) return false;
      }

      if (!q) return true;
      const hay = [
        c.initials_or_alias,
        c.filename,
        c.education_summary,
        ...c.skills_and_tools,
        ...c.key_projects_and_roles,
        ...c.crossover_badges,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    return list.sort((a, b) => {
      if (sortField === "score") {
        const sA =
          activeTab === "human_review" || activeTab === "rejected" || activeTab === "both"
            ? Math.max(getRoleScore(a, "lca_consultant"), getRoleScore(a, "uiux_intern"))
            : getRoleScore(a, activeRoleForDisplay);
        const sB =
          activeTab === "human_review" || activeTab === "rejected" || activeTab === "both"
            ? Math.max(getRoleScore(b, "lca_consultant"), getRoleScore(b, "uiux_intern"))
            : getRoleScore(b, activeRoleForDisplay);
        return sB - sA;
      }
      if (sortField === "relevant_exp") {
        const expA =
          activeTab === "both"
            ? Math.max(a.relevant_years_by_domain.lca_consultant ?? 0, a.relevant_years_by_domain.uiux_intern ?? 0)
            : a.relevant_years_by_domain[activeRoleForDisplay] ?? 0;
        const expB =
          activeTab === "both"
            ? Math.max(b.relevant_years_by_domain.lca_consultant ?? 0, b.relevant_years_by_domain.uiux_intern ?? 0)
            : b.relevant_years_by_domain[activeRoleForDisplay] ?? 0;
        return expB - expA;
      }
      if (sortField === "total_exp") {
        return b.total_career_years - a.total_career_years;
      }
      if (sortField === "repairs") {
        return b.forensic_repairs.length - a.forensic_repairs.length;
      }
      return 0;
    });
  }, [candidates, activeTab, lcaBand, hideOverqualifiedUiux, searchQuery, sortField, activeRoleForDisplay]);

  const exportCsv = () => {
    const headers = [
      "Candidate ID",
      "Alias",
      "Filename",
      "Classification",
      "Needs Human Review",
      "LCA Score (2-3y)",
      "LCA Score (4-6y)",
      "UI/UX Score",
      "Relevant LCA Yrs",
      "Relevant UI/UX Yrs",
      "Total Career Yrs",
      "Forensic Repairs",
      "Headline / Rationale",
    ];

    const rows = filteredCandidates.map((c) => [
      `"${c.candidate_id}"`,
      `"${c.initials_or_alias.replace(/"/g, '""')}"`,
      `"${c.filename.replace(/"/g, '""')}"`,
      `"${c.primary_classification}"`,
      c.needs_human_review ? "YES" : "NO",
      c.evaluations.lca_consultant?.score_variants?.jd_2_3y ?? c.evaluations.lca_consultant?.overall_score ?? 0,
      c.evaluations.lca_consultant?.score_variants?.prompt_4_6y ?? c.evaluations.lca_consultant?.overall_score ?? 0,
      c.evaluations.uiux_intern?.overall_score ?? 0,
      c.relevant_years_by_domain.lca_consultant ?? 0,
      c.relevant_years_by_domain.uiux_intern ?? 0,
      c.total_career_years,
      c.forensic_repairs.length,
      `"${(c.needs_human_review ? c.classification_reason : c.evaluations[activeRoleForDisplay]?.rationale_headline || "")
        .replace(/[\r\n]+/g, " ")
        .replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `candidates_${activeTab}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/evaluate", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) {
        const errText = await resp.text();
        let message = errText || `Upload failed with status ${resp.status}`;
        try {
          const parsedJson = JSON.parse(errText);
          if (parsedJson && parsedJson.detail) {
            message = typeof parsedJson.detail === "string" ? parsedJson.detail : JSON.stringify(parsedJson.detail);
          }
        } catch {
          // plain text error
        }
        throw new Error(message);
      }
      const data = await resp.json();
      const cand: EvaluatedCandidate = {
        ...data.candidate,
        matched_baseline: Boolean(data.matched_baseline),
        is_live_upload: true,
      };

      setCandidates((prev) => {
        const existingIdx = prev.findIndex(
          (item) => item.content_hash === cand.content_hash || item.candidate_id === cand.candidate_id
        );
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = cand;
          return copy;
        }
        return [cand, ...prev];
      });

      setUploadNotice({
        message: data.notice,
        matchedBaseline: Boolean(data.matched_baseline),
        candidateId: cand.candidate_id,
      });

      // Switch to the appropriate bucket tab and open the candidate drawer
      if (cand.needs_human_review) {
        setActiveTab("human_review");
      } else if (cand.primary_classification === "lca_consultant") {
        setActiveTab("lca_consultant");
      } else if (cand.primary_classification === "uiux_intern") {
        setActiveTab("uiux_intern");
      } else if (cand.primary_classification === "both") {
        setActiveTab("both");
      } else {
        setActiveTab("rejected");
      }
      setSelectedCandidate(cand);
      setDrawerTab("evaluation");
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Failed to evaluate uploaded resume.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)]">
      {/* Top Operational Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded font-bold text-xs bg-[var(--primary)] text-white">
                TT
              </span>
              <h1 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                TalentTriage · Dual-Role Resume Screening & Forensic Ranking
              </h1>
              <span className="text-xs px-2 py-0.5 rounded font-medium bg-[var(--primary-soft)] text-[var(--ink)] border border-[var(--border)]">
                {candidates.length} Resumes Indexed
              </span>
              <span className="text-xs px-2 py-0.5 rounded font-medium bg-[var(--warn-soft)] text-[var(--ink)] border border-[var(--border)]">
                {counts.repairedTotal} Forensically Healed
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] mt-1">
              Stage 1: Gemini 3.5 Flash Lite Forensic Repair & Span Union · Stage 2: System One Probabilistic Decision
              Gates (`Noul` + `Score`) · Stage 3: Deterministic Curve Aggregator
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-raised)] transition-colors"
              title="Download currently filtered candidate evaluations as CSV"
            >
              <Download className="w-3.5 h-3.5 text-[var(--muted)]" />
              Export CSV
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.pdf,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="resume-upload-input"
            />
            <label
              htmlFor="resume-upload-input"
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded text-xs font-semibold cursor-pointer transition-colors ${
                isUploading
                  ? "bg-[var(--surface-raised)] text-[var(--muted)] cursor-wait"
                  : "bg-[var(--primary)] text-white hover:opacity-95"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              {isUploading ? "Evaluating Resume..." : "Upload & Rank Resume (.docx / .pdf)"}
            </label>
          </div>
        </div>

        {/* Upload / Baseline Deduplication Banner */}
        {uploadNotice && (
          <div className="max-w-7xl mx-auto mt-3 px-3.5 py-2.5 rounded border border-[var(--border)] bg-[var(--primary-soft)] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--primary)] shrink-0" />
              <span className="font-semibold">
                {uploadNotice.matchedBaseline ? "SHA-256 Baseline Deduplication Triggered:" : "Live Evaluation Complete:"}
              </span>
              <span>{uploadNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadNotice(null)}
              className="text-[var(--muted)] hover:text-[var(--ink)] p-1"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {uploadError && (
          <div className="max-w-7xl mx-auto mt-3 px-3.5 py-2.5 rounded border border-[var(--danger)] bg-[var(--danger-soft)] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--danger)] shrink-0" />
              <span className="font-semibold">Upload Evaluation Error:</span>
              <span>{uploadError}</span>
            </div>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="text-[var(--muted)] hover:text-[var(--ink)] p-1"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-5 flex flex-col gap-4">
        {/* Role & Triage Navigation Tabs + Instant 0ms Governance Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <nav className="flex flex-wrap items-center gap-1.5" aria-label="Candidate classification buckets">
            <button
              type="button"
              onClick={() => setActiveTab("lca_consultant")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === "lca_consultant"
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-raised)] border border-[var(--border)]"
              }`}
            >
              1. LCA Consultant ({counts.lca})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("uiux_intern")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === "uiux_intern"
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-raised)] border border-[var(--border)]"
              }`}
            >
              2. UI/UX Design Intern ({counts.uiux})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("both")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === "both"
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-raised)] border border-[var(--border)]"
              }`}
            >
              Both / Domain Crossover ({counts.both})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("human_review")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                activeTab === "human_review"
                  ? "bg-[var(--warn)] text-white"
                  : "bg-[var(--warn-soft)] text-[var(--ink)] hover:opacity-90 border border-[var(--border)]"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Human Review Queue ({counts.humanReview})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("rejected")}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === "rejected"
                  ? "bg-[var(--danger)] text-white"
                  : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] border border-[var(--border)]"
              }`}
            >
              Confident Rejects ({counts.rejected})
            </button>
          </nav>

          {/* Role-Specific 0ms Governance Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {activeTab === "lca_consultant" && (
              <div
                className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs"
                role="group"
                aria-label="LCA Experience Target Toggle"
              >
                <span className="px-2 py-1 text-[var(--muted)] font-medium">Experience Target:</span>
                <button
                  type="button"
                  onClick={() => setLcaBand("jd_2_3y")}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                    lcaBand === "jd_2_3y"
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--ink)] hover:bg-[var(--surface-raised)]"
                  }`}
                >
                  JD Target (2–3 yrs)
                </button>
                <button
                  type="button"
                  onClick={() => setLcaBand("prompt_4_6y")}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                    lcaBand === "prompt_4_6y"
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--ink)] hover:bg-[var(--surface-raised)]"
                  }`}
                >
                  Prompt Target (4–6 yrs)
                </button>
              </div>
            )}

            {activeTab === "uiux_intern" && (
              <label className="inline-flex items-center gap-2 text-xs font-medium bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideOverqualifiedUiux}
                  onChange={(e) => setHideOverqualifiedUiux(e.target.checked)}
                  className="rounded accent-[var(--primary)]"
                />
                <span>Hide Overqualified (&gt;2 yrs Design Exp)</span>
              </label>
            )}
          </div>
        </div>

        {/* Search & Sort Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-3.5 h-3.5 text-[var(--muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Filter candidates"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by alias, tool (SimaPro, openLCA, Figma), standard (ISO 14040), or university..."
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-2 focus:outline-[var(--primary)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] p-0.5"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-[var(--muted)]" />
            <label htmlFor="sort-select" className="text-[var(--muted)] font-medium">
              Sort by:
            </label>
            <select
              id="sort-select"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] font-medium text-xs"
            >
              <option value="score">Role Match Score (High → Low)</option>
              <option value="relevant_exp">Relevant Domain Experience (Years)</option>
              <option value="total_exp">Total Career Experience (Years)</option>
              <option value="repairs">Forensic Repairs Count</option>
            </select>
          </div>
        </div>

        {/* Accessible Responsive Table per modern-web-guidance */}
        <div
          tabIndex={0}
          role="region"
          aria-labelledby={tableCaptionId}
          className="table-wrapper"
        >
          <table>
            <caption id={tableCaptionId} className="sr-only">
              Ranked candidate evaluations for {activeTab}
            </caption>
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider">
                <th className="py-2.5 px-3 text-left">Rank & Candidate</th>
                <th className="py-2.5 px-3 text-left">Headline & Evidence Summary</th>
                <th className="py-2.5 px-3 text-left">Experience Math</th>
                <th className="py-2.5 px-3 text-left">System 1 Sub-Scores</th>
                <th className="py-2.5 px-3 text-right">Match Score</th>
                <th className="py-2.5 px-3 text-left">Flags & Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[var(--muted)]">
                    No candidates match the current filter criteria. Try clearing the search box or switching tabs.
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((cand, index) => {
                  const roleKey: "lca_consultant" | "uiux_intern" =
                    activeTab === "lca_consultant"
                      ? "lca_consultant"
                      : activeTab === "uiux_intern"
                      ? "uiux_intern"
                      : cand.primary_classification === "both"
                      ? (getRoleScore(cand, "uiux_intern") > getRoleScore(cand, "lca_consultant") ? "uiux_intern" : "lca_consultant")
                      : cand.primary_classification === "uiux_intern"
                      ? "uiux_intern"
                      : cand.primary_classification === "lca_consultant"
                      ? "lca_consultant"
                      : activeRoleForDisplay;
                  const ev = cand.evaluations[roleKey];
                  const displayScore = getRoleScore(cand, roleKey);
                  const relYears = cand.relevant_years_by_domain[roleKey] ?? 0;

                  return (
                    <tr
                      key={cand.candidate_id}
                      tabIndex={0}
                      onClick={() => {
                        setSelectedCandidate(cand);
                        setDrawerTab("evaluation");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedCandidate(cand);
                          setDrawerTab("evaluation");
                        }
                      }}
                      className="cursor-pointer transition-colors focus:outline-none focus:bg-[var(--surface-raised)]"
                    >
                      <th scope="row" className="py-3 px-3 font-medium align-top whitespace-nowrap border-r border-[var(--border)]">
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-mono font-semibold bg-[var(--surface-raised)] text-[var(--ink)]">
                            #{index + 1}
                          </span>
                          <div>
                            <div className="font-semibold text-[var(--ink)] flex items-center gap-1.5">
                              <span>{cand.initials_or_alias}</span>
                              {cand.matched_baseline && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--primary)] text-white">
                                  Baseline Match
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-[var(--muted)] truncate max-w-[165px]">
                              {cand.filename}
                            </div>
                          </div>
                        </div>
                      </th>

                      <td className="py-3 px-3 align-top max-w-md">
                        <div className="font-medium text-[var(--ink)] leading-snug">
                          {cand.needs_human_review ? cand.classification_reason : ev.rationale_headline}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {cand.skills_and_tools.slice(0, 5).map((skill) => (
                            <span
                              key={skill}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--surface-raised)] text-[var(--ink)]"
                            >
                              {skill}
                            </span>
                          ))}
                          {cand.crossover_badges.map((badge) => (
                            <span
                              key={badge}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--primary-soft)] text-[var(--ink)] border border-[var(--border)]"
                            >
                              <Sparkles className="w-2.5 h-2.5 text-[var(--primary)]" />
                              {badge}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <div className="font-semibold text-[var(--ink)]">
                          {relYears.toFixed(1)} yrs{" "}
                          <span className="text-[11px] font-normal text-[var(--muted)]">relevant</span>
                        </div>
                        <div className="text-[11px] text-[var(--muted)]">
                          {cand.total_career_years.toFixed(1)} yrs total career
                        </div>
                      </td>

                      <td className="py-3 px-3 align-top">
                        <div className="space-y-1 min-w-[170px]">
                          {Object.entries(ev.sub_scores).map(([k, val]) => (
                            <div key={k} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-[var(--muted)] truncate max-w-[125px]">
                                {k.replace(/_/g, " ")}
                              </span>
                              <span className="font-mono font-semibold text-[var(--ink)]">{val.toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                        <div
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded text-sm font-mono font-bold ${
                            displayScore >= 65
                              ? "bg-[var(--accent)] text-white"
                              : displayScore >= 38
                              ? "bg-[var(--primary-soft)] text-[var(--ink)] border border-[var(--border)]"
                              : "bg-[var(--surface-raised)] text-[var(--muted)]"
                          }`}
                        >
                          {displayScore.toFixed(1)}
                        </div>
                        {activeTab === "both" ? (
                          <div className="text-[10px] font-mono text-[var(--muted)] mt-1">
                            LCA: {getRoleScore(cand, "lca_consultant").toFixed(0)} · UI/UX:{" "}
                            {getRoleScore(cand, "uiux_intern").toFixed(0)}
                          </div>
                        ) : roleKey === "lca_consultant" ? (
                          <div className="text-[10px] font-mono text-[var(--muted)] mt-1">
                            2-3y: {ev.score_variants.jd_2_3y?.toFixed(1)} · 4-6y:{" "}
                            {ev.score_variants.prompt_4_6y?.toFixed(1)}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 px-3 align-top">
                        <div className="flex flex-col items-start gap-1">
                          {cand.needs_human_review ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--warn)] text-white">
                              <ShieldAlert className="w-3 h-3" />
                              Needs Human Review ({cand.parse_status})
                            </span>
                          ) : ev.seniority_flag === "overqualified" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--warn-soft)] text-[var(--ink)] border border-[var(--warn)]">
                              Overqualified ({relYears.toFixed(1)}y &gt; 2y cap)
                            </span>
                          ) : roleKey === "lca_consultant" && lcaBand === "prompt_4_6y" && relYears < 4.0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--muted)]">
                              Under 4–6y Target ({relYears.toFixed(1)}y)
                            </span>
                          ) : roleKey === "lca_consultant" && ev.seniority_flag === "underqualified" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--surface-raised)] text-[var(--muted)]">
                              Under 2–3y Target ({relYears.toFixed(1)}y)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--accent-soft)] text-[var(--ink)]">
                              Target Tenure Band
                            </span>
                          )}

                          {cand.forensic_repairs.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--warn-soft)] text-[var(--ink)]">
                              <Wrench className="w-2.5 h-2.5 text-[var(--warn)]" />
                              {cand.forensic_repairs.length} Forensic Repair
                              {cand.forensic_repairs.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Native <dialog closedby="any"> Candidate Inspector Drawer per modern-web-guidance */}
      <dialog
        ref={dialogRef}
        {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
        aria-labelledby={drawerTitleId}
        className="candidate-drawer"
      >
        {selectedCandidate && (
          <div className="h-full flex flex-col">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)] flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 id={drawerTitleId} className="text-base font-bold text-[var(--ink)]">
                    Candidate {selectedCandidate.initials_or_alias}
                  </h2>
                  <span className="text-xs font-mono text-[var(--muted)]">{selectedCandidate.filename}</span>
                  <span className="text-xs px-2 py-0.5 rounded font-semibold bg-[var(--primary-soft)] text-[var(--ink)]">
                    {selectedCandidate.word_count} words · {selectedCandidate.parse_status}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">{selectedCandidate.education_summary}</p>
              </div>

              <div className="flex items-center gap-2">
                {selectedCandidate.source_url && (
                  <a
                    href={selectedCandidate.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-[var(--border)] bg-[var(--bg)] text-[var(--ink)] hover:bg-[var(--surface-raised)]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Zoho Source Folder
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                  className="p-1.5 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)]"
                  aria-label="Close candidate drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Sub-navigation */}
            <div className="px-6 pt-2 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDrawerTab("evaluation")}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  drawerTab === "evaluation"
                    ? "border-[var(--primary)] text-[var(--ink)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                Role Evaluations & Evidence
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("resume")}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors inline-flex items-center gap-1.5 ${
                  drawerTab === "resume"
                    ? "border-[var(--primary)] text-[var(--ink)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Healed Resume & Forensic Repairs ({selectedCandidate.forensic_repairs.length})
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab("methodology")}
                className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  drawerTab === "methodology"
                    ? "border-[var(--primary)] text-[var(--ink)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                Work Spans & Math Trace
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {drawerTab === "evaluation" && (
                <>
                  {/* Triage & Classification Banner */}
                  <div className="p-3.5 rounded border border-[var(--border)] bg-[var(--surface)]">
                    <div className="font-semibold text-[var(--ink)]">
                      4-Way Triage: <span className="uppercase font-mono">{selectedCandidate.primary_classification}</span>
                    </div>
                    <p className="text-[var(--muted)] mt-1">{selectedCandidate.classification_reason}</p>
                    {selectedCandidate.crossover_badges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedCandidate.crossover_badges.map((b) => (
                          <span
                            key={b}
                            className="px-2 py-0.5 rounded font-semibold bg-[var(--primary)] text-white text-[11px]"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dual Role Comparison Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(["lca_consultant", "uiux_intern"] as const).map((rKey) => {
                      const ev = selectedCandidate.evaluations[rKey];
                      const title = rKey === "lca_consultant" ? "LCA Consultant (JD1)" : "UI/UX Design Intern (JD2)";
                      const relY = selectedCandidate.relevant_years_by_domain[rKey] ?? 0;

                      return (
                        <div key={rKey} className="p-4 rounded border border-[var(--border)] bg-[var(--bg)] space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-bold text-sm text-[var(--ink)]">{title}</h3>
                              <span className="text-[11px] text-[var(--muted)]">
                                Relevant Exp: <strong>{relY.toFixed(2)} yrs</strong> · Seniority:{" "}
                                <strong>{ev.seniority_flag}</strong>
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-mono font-bold text-[var(--ink)]">
                                {getRoleScore(selectedCandidate, rKey).toFixed(1)}
                              </div>
                              <div className="text-[10px] uppercase font-semibold text-[var(--muted)]">
                                {ev.match_tier.replace("_", " ")}
                              </div>
                            </div>
                          </div>

                          {rKey === "lca_consultant" && (
                            <div className="p-2 rounded bg-[var(--surface)] border border-[var(--border)] flex justify-between text-[11px]">
                              <span>
                                JD 2–3y Score: <strong>{ev.score_variants.jd_2_3y?.toFixed(1)}</strong>
                              </span>
                              <span>
                                Prompt 4–6y Score: <strong>{ev.score_variants.prompt_4_6y?.toFixed(1)}</strong>
                              </span>
                            </div>
                          )}

                          <p className="text-[var(--ink)] leading-relaxed">{ev.rationale_headline}</p>

                          {/* System 1 Noul Gates */}
                          <div>
                            <div className="font-semibold text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1.5">
                              System 1 Probabilistic Gates (Noul)
                            </div>
                            <div className="space-y-1">
                              {Object.entries(ev.gate_probabilities).map(([gk, gval]) => (
                                <div key={gk} className="flex items-center justify-between text-[11px]">
                                  <span className="font-mono text-[var(--muted)]">{gk}</span>
                                  <span className="font-mono font-semibold text-[var(--ink)]">
                                    {(gval * 100).toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* System 1 Rubric Scores */}
                          <div>
                            <div className="font-semibold text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1.5">
                              System 1 Calibrated Rubric (Score 0–100)
                            </div>
                            <div className="space-y-1.5">
                              {Object.entries(ev.sub_scores).map(([sk, sval]) => (
                                <div key={sk}>
                                  <div className="flex justify-between text-[11px] mb-0.5">
                                    <span className="capitalize">{sk.replace(/_/g, " ")}</span>
                                    <span className="font-mono font-semibold">{sval.toFixed(1)} / 100</span>
                                  </div>
                                  <div className="w-full h-1.5 rounded bg-[var(--surface-raised)] overflow-hidden">
                                    <div
                                      className="h-full bg-[var(--primary)]"
                                      style={{ width: `${Math.min(100, Math.max(0, sval))}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Verbatim Evidence Bullets */}
                          {ev.evidence_bullets.length > 0 && (
                            <div>
                              <div className="font-semibold text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1">
                                Extracted Evidence Bullets
                              </div>
                              <ul className="list-disc pl-4 space-y-1 text-[var(--ink)]">
                                {ev.evidence_bullets.map((b, i) => (
                                  <li key={i}>{b}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {drawerTab === "resume" && (
                <div className="space-y-4">
                  {selectedCandidate.forensic_repairs.length > 0 ? (
                    <div className="p-3.5 rounded border border-[var(--warn)] bg-[var(--warn-soft)] space-y-2">
                      <div className="font-semibold text-[var(--ink)] flex items-center gap-1.5">
                        <Wrench className="w-4 h-4 text-[var(--warn)]" />
                        Forensic Anonymizer & Scraper Repairs Applied ({selectedCandidate.forensic_repairs.length})
                      </div>
                      <div className="space-y-1.5">
                        {selectedCandidate.forensic_repairs.map((rep, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded bg-[var(--bg)] border border-[var(--border)] flex flex-col gap-0.5"
                          >
                            <div className="font-mono text-[11px]">
                              <span className="line-through text-[var(--danger)]">{rep.raw_fragment}</span>
                              {" → "}
                              <span className="font-bold text-[var(--accent)]">{rep.repaired_value}</span>
                            </div>
                            <div className="text-[11px] text-[var(--muted)]">{rep.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
                      No regex-stripped tokens or scraper anomalies detected in this document.
                    </div>
                  )}

                  <div className="p-4 rounded border border-[var(--border)] bg-[var(--surface)]">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
                      Full Inline Healed Resume Text (Repaired Tokens Highlighted)
                    </div>
                    {renderHighlightedText(selectedCandidate.healed_text, selectedCandidate.forensic_repairs)}
                  </div>
                </div>
              )}

              {drawerTab === "methodology" && (
                <div className="space-y-4">
                  <div className="p-4 rounded border border-[var(--border)] bg-[var(--surface)] space-y-2">
                    <h3 className="font-bold text-sm text-[var(--ink)]">
                      Interval-Merged Experience Calculation (Anti-Overlap Math)
                    </h3>
                    <p className="text-[var(--muted)]">
                      Overlapping employment and freelance spans are merged via calendar month union before computing
                      domain-specific years. Teaching Assistantships are excluded from industry LCA tenure.
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      <div className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                        <div className="text-[10px] uppercase text-[var(--muted)]">Total Career Union</div>
                        <div className="text-base font-mono font-bold">
                          {selectedCandidate.total_career_years.toFixed(2)} yrs
                        </div>
                      </div>
                      <div className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                        <div className="text-[10px] uppercase text-[var(--muted)]">LCA / Sustainability</div>
                        <div className="text-base font-mono font-bold">
                          {(selectedCandidate.relevant_years_by_domain.lca_consultant ?? 0).toFixed(2)} yrs
                        </div>
                      </div>
                      <div className="p-2.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                        <div className="text-[10px] uppercase text-[var(--muted)]">UI/UX Product Design</div>
                        <div className="text-base font-mono font-bold">
                          {(selectedCandidate.relevant_years_by_domain.uiux_intern ?? 0).toFixed(2)} yrs
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-[var(--ink)]">
                      Extracted Work Spans ({selectedCandidate.work_spans?.length ?? 0})
                    </h4>
                    {selectedCandidate.work_spans && selectedCandidate.work_spans.length > 0 ? (
                      <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded">
                        {selectedCandidate.work_spans.map((sp, i) => (
                          <div key={i} className="p-3 bg-[var(--bg)] flex items-center justify-between gap-4">
                            <div>
                              <div className="font-semibold text-[var(--ink)]">
                                {sp.title} — <span className="font-normal">{sp.organization}</span>
                              </div>
                              <div className="text-[11px] text-[var(--muted)]">
                                Domain: <span className="font-mono">{sp.domain}</span> ·{" "}
                                {sp.is_internship ? "Internship / TA" : "Full-time / Freelance"}
                              </div>
                            </div>
                            <div className="text-right font-mono text-[11px]">
                              <div>
                                {sp.start_date || "?"} → {sp.end_date || "?"}
                              </div>
                              <div className="text-[var(--muted)]">{sp.months_duration} mos</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded border border-[var(--border)] text-[var(--muted)]">
                        No formal employment spans listed in resume (student / project-only profile).
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded border border-[var(--border)] bg-[var(--surface)] font-mono text-[11px] text-[var(--muted)] break-all">
                    SHA-256 Content Hash: {selectedCandidate.content_hash}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
