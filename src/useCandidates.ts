import { useEffect, useRef, useState } from "react";
import baselineData from "../data/baseline_candidates.json";
import { upsertCandidate } from "./candidates";
import { restoreCandidates, saveCandidates } from "./candidateStorage";
import type { EvaluatedCandidate } from "./types";

interface EvaluationResponse {
  candidate: EvaluatedCandidate;
  matched_baseline: boolean;
}

export function useCandidates() {
  const [candidates, setCandidates] = useState<EvaluatedCandidate[]>(
    () => restoreCandidates(baselineData as EvaluatedCandidate[]),
  );
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const uploadInProgress = useRef(false);

  useEffect(() => {
    setStorageWarning(
      saveCandidates(candidates, baselineData as EvaluatedCandidate[])
        ? null
        : "Your uploads are visible, but this browser could not save them. They may be lost on refresh.",
    );
  }, [candidates]);

  async function upload(file: File): Promise<EvaluatedCandidate | null> {
    if (uploadInProgress.current) return null;
    uploadInProgress.current = true;
    setIsUploading(true);
    setNotice(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/evaluate", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const body = await response.text();
        let message = `Could not evaluate the resume (${response.status}). Please try again.`;
        try {
          const detail = JSON.parse(body).detail;
          if (typeof detail === "string") message = detail;
        } catch {
          // Proxies can return HTML instead of the API's JSON error response.
        }
        throw new Error(message);
      }
      const data: EvaluationResponse = await response.json();
      const candidate = {
        ...data.candidate,
        matched_baseline: data.matched_baseline,
      };
      setCandidates((previous) => upsertCandidate(previous, candidate));
      setNotice(
        data.matched_baseline
          ? "Matched Baseline Candidate. The original evaluation has been kept."
          : "Resume evaluated and added to the rankings.",
      );
      return candidate;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not upload the resume. Please try again.",
      );
      return null;
    } finally {
      uploadInProgress.current = false;
      setIsUploading(false);
    }
  }

  return {
    candidates,
    upload,
    isUploading,
    notice,
    error: error ?? storageWarning,
    clearNotice: () => setNotice(null),
    clearError: () => {
      setError(null);
      setStorageWarning(null);
    },
  };
}
