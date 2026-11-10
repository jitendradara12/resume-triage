import re
import httpx

from core.clients import evaluate_decisions, run_stage1_extraction
from core.parser import ParsedDocument, compute_content_hash, parse_document_bytes
from core.schemas import EvaluatedCandidate
from core.scoring import (
    DECISION_QUESTIONS,
    LCA_QUESTIONS,
    UIUX_QUESTIONS,
    aggregate_candidate,
    build_decision_state,
    heuristic_decision_fallback,
)

ZOHO_FOLDER_URL = "https://workdrive.zohoexternal.in/folder/nyche10b5dccdb33743dfa46604e3aa2a2e2b"


async def evaluate_resume_bytes(
    file_bytes: bytes,
    filename: str,
    source_url: str | None = None,
    http_client: httpx.AsyncClient | None = None,
    parsed: ParsedDocument | None = None,
) -> EvaluatedCandidate:
    """Full 3-stage pipeline for a single resume file."""
    raw_text, parse_status, parse_diag = parsed if parsed is not None else parse_document_bytes(file_bytes, filename)
    content_hash = compute_content_hash(raw_text) if raw_text else compute_content_hash(filename)

    m_id = re.search(r"(\d{10,})", filename)
    candidate_id = f"cand_{m_id.group(1)}" if m_id else f"cand_{content_hash[:10]}"

    if parse_status != "ok" or not raw_text.strip():
        return aggregate_candidate(
            candidate_id=candidate_id,
            filename=filename,
            content_hash=content_hash,
            source_url=source_url,
            parse_status=parse_status,
            parse_diagnostics=parse_diag,
            raw_text="",
            stage1=None,
            jev_answers=None,
        )

    # Stage 1: System 2 (Gemini Flash Lite + deterministic forensic repairs)
    stage1 = await run_stage1_extraction(raw_text)

    # Stage 2: System 1 (Decision Engine: bundled LCA + UI/UX judgments over structured state)
    state = build_decision_state(stage1)
    combined_answers = await evaluate_decisions(
        state=state,
        questions=DECISION_QUESTIONS,
        http_client=http_client,
    )

    if not combined_answers:
        combined_answers = heuristic_decision_fallback(stage1)

    # Stage 3: Deterministic Aggregator
    return aggregate_candidate(
        candidate_id=candidate_id,
        filename=filename,
        content_hash=content_hash,
        source_url=source_url,
        parse_status=parse_status,
        parse_diagnostics=parse_diag,
        raw_text=raw_text,
        stage1=stage1,
        jev_answers=combined_answers,
    )
