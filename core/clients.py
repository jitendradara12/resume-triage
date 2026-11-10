import asyncio
import os
import re
from typing import Any, Literal
import httpx
from google import genai
from google.genai import types
from pydantic import BaseModel

from core.schemas import ForensicRepair, Stage1Extraction, WorkSpan
from core.parser import apply_deterministic_repairs


class _GeminiStage1Payload(BaseModel):
    education_summary: str
    skills_and_tools: list[str]
    key_projects_and_roles: list[str]
    work_spans: list[WorkSpan]
    lca_evidence_bullets: list[str]
    uiux_evidence_bullets: list[str]


STAGE1_SYSTEM_PROMPT = """You are a resume extraction engine.
Extract only facts supported by the supplied text. Cleanup has already marked damaged text in square brackets.
Never reconstruct missing numbers, standards, employers, dates, quantities, units, or words from context.
Keep unreadable fields unknown. Do not correct an implausible year to a guessed year.
Do not treat an unreadable standard number or emission scope as evidence of a specific standard or scope.
An employer listed for one role does not establish the employer for another role.
Return these structured fields:
1. `education_summary`: Concise 1-line summary of degrees, institutions, and graduation years.
2. `skills_and_tools`: Use the exact names of technical tools, software, standards, and methodologies explicitly present in the supplied text. Do not expand an incomplete ISO reference into a specific standard.
3. `key_projects_and_roles`: 2 to 4 concise highlights of their most relevant roles or projects.
4. `work_spans`: Every employment, freelance, or internship role in the Experience section.
   - Do NOT include academic degrees or classroom/personal projects as work_spans unless explicitly work/internship/freelance/TA roles.
   - `start_date`: "YYYY-MM" or "YYYY" (or null if missing/unlisted).
   - `end_date`: "YYYY-MM", "YYYY", or "Present" (use Nov 2026 as current reference date if calculating duration).
   - `months_duration`: Integer months calculated from listed work dates or an explicit duration. Use 0 when neither is available; never infer a duration from damaged text.
   - `domain`: Classify strictly as:
     - `"lca_sustainability"`: LCA, ESG, GHG accounting, carbon footprinting, environmental engineering, EHS, sustainability consulting, circular economy, product compliance (RoHS/REACH).
     - `"uiux_design"`: UI/UX design, product design, interaction design, visual/graphic/web design, design engineering.
     - `"other"`: Anything else (e.g., banking risk analytics, film sound editing, general unrelated ops).
   - `is_internship`: True if title or description indicates Intern, Trainee, Teaching Assistant, or Fellowship.
5. `lca_evidence_bullets`: Up to 3 verbatim quotes from the supplied text proving LCA / Sustainability / GHG capability (empty list if none).
6. `uiux_evidence_bullets`: Up to 3 verbatim quotes from the supplied text proving UI/UX / Product Design capability (empty list if none).
"""


def get_gemini_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    use_vertex = os.environ.get("GEMINI_USE_VERTEX", "true").lower() in ("true", "1", "yes")
    project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GEMINI_PROJECT")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION") or os.environ.get("GEMINI_LOCATION") or "us-central1"

    if use_vertex and project:
        return genai.Client(vertexai=True, project=project, location=location)
    return genai.Client(vertexai=use_vertex, api_key=api_key)


def _heuristic_stage1_fallback(raw_text: str, det_repairs: list[ForensicRepair]) -> Stage1Extraction:
    """Heuristic fallback when Gemini is unavailable or unconfigured."""
    text_lower = raw_text.lower()
    skills: list[str] = []
    lca_keywords = [
        "SimaPro", "GaBi", "openLCA", "Umberto", "Ecoinvent",
        "ISO 14040", "ISO 14044", "ISO 14064", "ISO 14067",
        "GHG Protocol", "Scope 1", "Scope 2", "Scope 3", "EPD", "PCF", "Life Cycle Assessment"
    ]
    uiux_keywords = [
        "Figma", "Wireframing", "Prototyping", "Design Systems", "User Research",
        "Usability Testing", "Information Architecture", "User Flows", "Heuristic Evaluation"
    ]
    for kw in lca_keywords + uiux_keywords:
        if kw.lower() in text_lower and kw not in skills:
            skills.append(kw)

    lca_hits = [kw for kw in lca_keywords if kw.lower() in text_lower]
    uiux_hits = [kw for kw in uiux_keywords if kw.lower() in text_lower]
    if len(lca_hits) >= len(uiux_hits) and lca_hits:
        dom: Literal["lca_sustainability", "uiux_design", "other"] = "lca_sustainability"
    elif uiux_hits:
        dom = "uiux_design"
    else:
        dom = "other"

    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    edu = "Education listed in profile text."
    for l in lines:
        if any(w in l.lower() for w in ["bachelor", "master", "b.tech", "m.tech", "b.des", "m.des", "university", "institute", "college"]):
            edu = l[:120]
            break

    lca_bullets = [l[:120] for l in lines if any(k.lower() in l.lower() for k in ["lca", "ghg", "carbon", "iso 140", "simapro", "openlca"])][:3]
    uiux_bullets = [l[:120] for l in lines if any(k.lower() in l.lower() for k in ["figma", "wireframe", "ui/ux", "prototype", "design system"])][:3]

    from core.scoring import _parse_date_to_month_index
    date_pattern = re.compile(
        r"(?:(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\b(\d{1,2}))[\s/-]+)?(20\d{2}|19\d{2})\s*(?:-|–|—|to)\s*(?:(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\b(\d{1,2}))[\s/-]+)?(20\d{2}|19\d{2}|present|current|now|ongoing|till date)",
        re.IGNORECASE,
    )
    work_spans: list[WorkSpan] = []

    for m in date_pattern.finditer(raw_text):
        s_mon = m.group(1) or m.group(2)
        s_yr = m.group(3)
        e_mon = m.group(4) or m.group(5)
        e_yr = m.group(6)
        start_str = f"{s_mon} {s_yr}".strip() if s_mon else s_yr
        end_str = f"{e_mon} {e_yr}".strip() if e_mon else e_yr

        s_idx = _parse_date_to_month_index(start_str, is_end=False)
        e_idx = _parse_date_to_month_index(end_str, is_end=True)
        dur = max(1, e_idx - s_idx + 1) if (s_idx and e_idx and e_idx >= s_idx) else 12

        line_start = raw_text.rfind("\n", 0, m.start())
        line_end = raw_text.find("\n", m.end())
        line_text = raw_text[max(0, line_start): len(raw_text) if line_end == -1 else line_end].strip()
        line_lower = line_text.lower()

        # Skip education lines unless explicitly an internship / assistantship role
        if re.search(r"^(?:education|academics?|qualifications?)\b", line_lower):
            continue
        if any(w in line_lower for w in ("bachelor", "master", "b.tech", "m.tech", "b.des", "m.des", "degree", "diploma", "high school", "cgpa", "gpa")):
            if not any(w in line_lower for w in ("intern", "trainee", "fellow", "assistant", " ta ")):
                continue

        is_intern = any(w in line_lower for w in ("intern", "trainee", "fellowship", "teaching assistant", " ta "))
        clean_title = re.sub(date_pattern, "", line_text)
        clean_title = re.sub(r"^(?:experience|roles?|work|employment)\s*:\s*", "", clean_title, flags=re.IGNORECASE)
        clean_title = clean_title.strip(" -–—:|,().")
        clean_title = re.sub(r"\s+(?:from|to)\s*$", "", clean_title, flags=re.IGNORECASE)
        clean_title = clean_title.strip(" -–—:|,().")

        org = "Experience"
        if " at " in clean_title:
            parts = re.split(r"\s+at\s+", clean_title, maxsplit=1, flags=re.IGNORECASE)
            title = parts[0].strip(" -–—:|,().")[:60]
            org = parts[1].strip(" -–—:|,().")[:60] or "Experience"
        elif " @ " in clean_title:
            parts = re.split(r"\s+@\s+", clean_title, maxsplit=1, flags=re.IGNORECASE)
            title = parts[0].strip(" -–—:|,().")[:60]
            org = parts[1].strip(" -–—:|,().")[:60] or "Experience"
        else:
            title = clean_title[:60] if clean_title else f"Role ({start_str} - {end_str})"

        # Determine domain for this span (prefer role-specific context, fall back to document dominant domain)
        if any(w in line_lower for w in ("lca", "ghg", "sustainability", "carbon", "environment", "epd", "simapro", "openlca", "gabi")):
            span_dom: Literal["lca_sustainability", "uiux_design", "other"] = "lca_sustainability"
        elif any(w in line_lower for w in ("ui/ux", "ui", "ux", "design", "figma", "wireframe", "frontend")):
            span_dom = "uiux_design"
        else:
            span_dom = dom

        work_spans.append(
            WorkSpan(
                title=title,
                organization=org,
                start_date=start_str,
                end_date=end_str,
                months_duration=dur,
                domain=span_dom,
                is_internship=is_intern,
            )
        )

    return Stage1Extraction(
        healed_text=raw_text,
        forensic_repairs=det_repairs,
        education_summary=edu,
        skills_and_tools=skills[:10],
        key_projects_and_roles=[l[:100] for l in lines[1:4]] if len(lines) > 1 else [],
        work_spans=work_spans,
        lca_evidence_bullets=lca_bullets,
        uiux_evidence_bullets=uiux_bullets,
    )


async def run_stage1_extraction(raw_text: str) -> Stage1Extraction:
    """Run deterministic text healing + Gemini structured extraction (with graceful fallback)."""
    healed_text, det_repairs = apply_deterministic_repairs(raw_text)
    api_key = os.environ.get("GEMINI_API_KEY", "")

    if not api_key:
        return _heuristic_stage1_fallback(healed_text, det_repairs)

    try:
        model_name = os.environ.get("STAGE1_MODEL", "gemini-3.5-flash-lite")
        client = get_gemini_client()

        def _call_gemini() -> _GeminiStage1Payload:
            resp = client.models.generate_content(
                model=model_name,
                contents=f"RESUME TEXT:\n---\n{healed_text}\n---",
                config=types.GenerateContentConfig(
                    system_instruction=STAGE1_SYSTEM_PROMPT,
                    temperature=0.0,
                    response_mime_type="application/json",
                    response_schema=_GeminiStage1Payload,
                ),
            )
            return _GeminiStage1Payload.model_validate_json(resp.text)

        payload = await asyncio.to_thread(_call_gemini)

        source = " ".join(healed_text.split())

        def source_quotes(bullets: list[str]) -> list[str]:
            return [
                bullet for bullet in bullets
                if bullet.strip() and " ".join(bullet.split()) in source
            ]

        return Stage1Extraction(
            healed_text=healed_text,
            forensic_repairs=det_repairs,
            education_summary=payload.education_summary,
            skills_and_tools=[
                skill for skill in payload.skills_and_tools
                if skill.strip() and " ".join(skill.split()).casefold() in source.casefold()
            ],
            key_projects_and_roles=payload.key_projects_and_roles,
            work_spans=payload.work_spans,
            lca_evidence_bullets=source_quotes(payload.lca_evidence_bullets),
            uiux_evidence_bullets=source_quotes(payload.uiux_evidence_bullets),
        )
    except Exception:
        return _heuristic_stage1_fallback(healed_text, det_repairs)


async def evaluate_decisions(
    state: dict[str, Any],
    questions: dict[str, dict[str, Any]],
    http_client: httpx.AsyncClient | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Provider-agnostic System 1 Decision Engine (Jev / Parallel Decisions).
    Supports OpenRouter (/api/alpha/decisions) and direct TypeSafe SDK/REST seamlessly via env vars.
    Returns normalized answers dict:
      - for noul: {"type": "noul", "noul": float}
      - for score: {"type": "score", "score": float, "confidence": float, "probabilities": dict}
    """
    typesafe_key = os.environ.get("TYPESAFE_API_KEY", "").strip()
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()

    default_provider = "typesafe" if (typesafe_key or not openrouter_key) else "openrouter"
    provider = os.environ.get("DECISION_PROVIDER", default_provider).lower()

    if provider in ("typesafe", "jev", "typesafe_rest"):
        model = os.environ.get("DECISION_MODEL", "jev-latest")
        url = os.environ.get("DECISION_API_URL", "https://api.typesafe.ai/v1/systemone")
        api_key = typesafe_key or openrouter_key
    elif provider == "openrouter":
        model = os.environ.get("DECISION_MODEL", "parallel/decisions-fast:free")
        url = os.environ.get("DECISION_API_URL", "https://openrouter.ai/api/alpha/decisions")
        api_key = openrouter_key or typesafe_key
    else:
        model = os.environ.get("DECISION_MODEL", "jev-latest")
        url = os.environ.get("DECISION_API_URL", "https://api.typesafe.ai/v1/systemone")
        api_key = typesafe_key or openrouter_key

    if not api_key:
        return {}

    if provider == "typesafe_sdk":
        try:
            from typesafe_sdk import AsyncTypeSafeClient, Noul, Score
            sdk_questions = {}
            for q_id, q_spec in questions.items():
                if q_spec["type"] == "noul":
                    noul_kwargs: dict[str, Any] = {"instructions": q_spec["instructions"]}
                    if "criteria" in q_spec:
                        noul_kwargs["criteria"] = q_spec["criteria"]
                    sdk_questions[q_id] = Noul(**noul_kwargs)
                elif q_spec["type"] == "score":
                    sdk_questions[q_id] = Score(instructions=q_spec["instructions"], criteria=q_spec["criteria"])
            async with AsyncTypeSafeClient(api_key=api_key) as ts_client:
                res = await ts_client.system_one(state=state, questions=sdk_questions)
                answers: dict[str, dict[str, Any]] = {}
                for q_id, q_spec in questions.items():
                    if q_spec["type"] == "noul":
                        ans = res.nouls[q_id]
                        answers[q_id] = {"type": "noul", "noul": float(ans.noul)}
                    else:
                        ans = res.scores[q_id]
                        answers[q_id] = {
                            "type": "score",
                            "score": float(ans.score),
                            "confidence": float(getattr(ans, "confidence", 0.8)),
                        }
                return answers
        except Exception:
            return {}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "state": state,
        "questions": questions,
    }

    close_client = False
    if http_client is None:
        http_client = httpx.AsyncClient(timeout=45.0)
        close_client = True

    try:
        for attempt in range(3):
            try:
                resp = await http_client.post(url, headers=headers, json=body)
                resp.raise_for_status()
                data = resp.json()
                return data.get("answers", {})
            except Exception:
                if attempt == 2:
                    return {}
                await asyncio.sleep(1.0 * (attempt + 1))
        return {}
    finally:
        if close_client:
            await http_client.aclose()
