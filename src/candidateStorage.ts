import { upsertCandidate } from "./candidates.ts";
import type { EvaluatedCandidate } from "./types";

export const UPLOAD_STORAGE_KEY = "talent-triage.uploads.v1";

function matchesBaseline(
  candidate: EvaluatedCandidate,
  baseline: EvaluatedCandidate[],
) {
  return baseline.some(
    (item) =>
      item.content_hash === candidate.content_hash ||
      item.candidate_id === candidate.candidate_id,
  );
}

export function restoreCandidates(
  baseline: EvaluatedCandidate[],
  storage?: Pick<Storage, "getItem">,
): EvaluatedCandidate[] {
  try {
    const uploads = JSON.parse(
      (storage ?? localStorage).getItem(UPLOAD_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(uploads)) return baseline;
    return uploads.reduce((candidates, candidate) => {
      if (
        !candidate ||
        typeof candidate.candidate_id !== "string" ||
        typeof candidate.content_hash !== "string" ||
        !candidate.evaluations?.lca_consultant ||
        !candidate.evaluations?.uiux_intern ||
        !Array.isArray(candidate.skills_and_tools) ||
        !Array.isArray(candidate.key_projects_and_roles) ||
        !Array.isArray(candidate.crossover_badges) ||
        !Array.isArray(candidate.forensic_repairs) ||
        !Array.isArray(candidate.work_spans) ||
        matchesBaseline(candidate, baseline)
      ) return candidates;
      return upsertCandidate(candidates, candidate);
    }, baseline);
  } catch {
    return baseline;
  }
}

export function saveCandidates(
  candidates: EvaluatedCandidate[],
  baseline: EvaluatedCandidate[],
  storage?: Pick<Storage, "setItem">,
): boolean {
  const uploads = candidates.filter(
    (candidate) => !matchesBaseline(candidate, baseline),
  );
  if (uploads.length === 0) return true;
  try {
    (storage ?? localStorage).setItem(UPLOAD_STORAGE_KEY, JSON.stringify(uploads));
    return true;
  } catch {
    return false;
  }
}
