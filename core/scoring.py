import re
from typing import Any, Literal
from core.schemas import (
    EvaluatedCandidate,
    ForensicRepair,
    RoleMatchResult,
    Stage1Extraction,
    WorkSpan,
)

# Reference "now" for ongoing roles ("Present") based on resume corpus timestamps (Nov 2026)
REF_YEAR = 2026
REF_MONTH = 11
REF_INDEX = REF_YEAR * 12 + REF_MONTH

_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _parse_date_to_month_index(date_str: str | None, is_end: bool = False) -> int | None:
    if not date_str:
        return None
    s = date_str.strip().lower()
    if re.search(r"\b(present|current|now|ongoing|till date|till now|continued?)\b", s):
        return REF_INDEX
    # YYYY-MM or YYYY-MM-DD
    m = re.match(r"^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?", s)
    if m:
        yr, mo = int(m.group(1)), int(m.group(2))
        mo = max(1, min(12, mo))
        return min(REF_INDEX, yr * 12 + mo)
    # MM/YYYY or MM-YYYY
    m_rev = re.match(r"^(\d{1,2})[-/](\d{4})$", s)
    if m_rev:
        mo, yr = int(m_rev.group(1)), int(m_rev.group(2))
        mo = max(1, min(12, mo))
        return min(REF_INDEX, yr * 12 + mo)
    # Month YYYY or Mon YYYY or Mon 'YY
    for name, mo_num in _MONTH_MAP.items():
        if re.search(rf"\b{name}[a-z]*\b", s):
            ym = re.search(r"(\d{4})", s)
            if ym:
                return min(REF_INDEX, int(ym.group(1)) * 12 + mo_num)
            ym2 = re.search(r"\b(\d{2})\b", s)
            if ym2:
                yr = 2000 + int(ym2.group(1))
                return min(REF_INDEX, yr * 12 + mo_num)
    # Just YYYY
    ym = re.search(r"(\d{4})", s)
    if ym:
        yr = int(ym.group(1))
        mo = 12 if is_end else 1
        return min(REF_INDEX, yr * 12 + mo)
    return None


def compute_experience_years(work_spans: list[WorkSpan]) -> tuple[float, dict[str, float]]:
    """
    Merge overlapping date intervals per domain and across all career spans.
    Strictly separates relevant_years_by_domain from total_career_years.
    Note: Excludes pure academic TA roles with 0 industry experience if flagged, or merges actual spans.
    """
    domain_intervals: dict[str, list[tuple[int, int]]] = {
        "lca_sustainability": [],
        "uiux_design": [],
        "other": [],
    }
    domain_unanchored_months: dict[str, int] = {
        "lca_sustainability": 0,
        "uiux_design": 0,
        "other": 0,
    }
    all_intervals: list[tuple[int, int]] = []
    all_unanchored_months = 0

    for span in work_spans:
        # Teaching Assistant at university does not count as industry LCA experience (e.g. PKG)
        title_lower = (span.title or "").lower()
        if "teaching assistant" in title_lower:
            continue

        start_idx = _parse_date_to_month_index(span.start_date, is_end=False)
        end_idx = _parse_date_to_month_index(span.end_date, is_end=True)
        dom = span.domain if span.domain in domain_intervals else "other"

        if start_idx is not None and end_idx is not None and end_idx >= start_idx:
            # Inclusive month interval [start_idx, end_idx + 1)
            interval = (start_idx, end_idx + 1)
            domain_intervals[dom].append(interval)
            all_intervals.append(interval)
        elif span.months_duration and span.months_duration > 0:
            dur = min(120, max(0, span.months_duration))
            domain_unanchored_months[dom] += dur
            all_unanchored_months += dur

    def _merge_months(intervals: list[tuple[int, int]], extra: int) -> float:
        if not intervals:
            return round(extra / 12.0, 2)
        sorted_iv = sorted(intervals, key=lambda x: (x[0], x[1]))
        merged = [sorted_iv[0]]
        for cur_s, cur_e in sorted_iv[1:]:
            prev_s, prev_e = merged[-1]
            if cur_s <= prev_e:
                merged[-1] = (prev_s, max(prev_e, cur_e))
            else:
                merged.append((cur_s, cur_e))
        total_m = sum(e - s for s, e in merged) + extra
        return round(total_m / 12.0, 2)

    total_years = _merge_months(all_intervals, all_unanchored_months)
    relevant_by_domain = {
        "lca_consultant": _merge_months(domain_intervals["lca_sustainability"], domain_unanchored_months["lca_sustainability"]),
        "uiux_intern": _merge_months(domain_intervals["uiux_design"], domain_unanchored_months["uiux_design"]),
        "other": _merge_months(domain_intervals["other"], domain_unanchored_months["other"]),
    }
    return total_years, relevant_by_domain


LCA_QUESTIONS: dict[str, dict[str, Any]] = {
    "has_lca_software": {
        "type": "noul",
        "instructions": "Does the candidate have hands-on experience with dedicated LCA software or databases such as SimaPro, GaBi (Sphera), openLCA, Umberto, or Ecoinvent?",
    },
    "has_ghg_standards": {
        "type": "noul",
        "instructions": "Does the candidate demonstrate direct knowledge or execution of ISO 14040/14044, ISO 14064, ISO 14067, GHG Protocol (Scope 1, 2, 3), EPDs, or PCFs?",
    },
    "is_unrelated_domain": {
        "type": "noul",
        "instructions": "Is this candidate completely unrelated to environmental sustainability, LCA, ESG, or climate (for example: pure UI/UX designer, graphic designer, or banking risk manager)?",
    },
    "software_and_data_mastery": {
        "type": "score",
        "instructions": "Rate the candidate's proficiency with LCA modeling software (SimaPro, GaBi, openLCA) and inventory databases (Ecoinvent, Agri-footprint, BAFU).",
        "criteria": [
            "No LCA software or environmental database experience",
            "Basic academic exposure, coursework, or general Excel-only environmental data tracking",
            "Applied hands-on modeling in openLCA, SimaPro, or GaBi with Ecoinvent or GHG emission factor libraries",
            "Expert industry LCA modeler building complex cradle-to-grave/gate product systems, EPDs, or multi-client LCA models",
        ],
    },
    "methodology_and_standards": {
        "type": "score",
        "instructions": "Rate the candidate's mastery of LCA, GHG, and ESG methodological standards (ISO 14040/44, ISO 14064/67, EN 15804, GHG Protocol Scope 1-3, CSRD/CBAM, EPDs, PCFs).",
        "criteria": [
            "No sustainability, environmental, or LCA standards mentioned",
            "Superficial keyword mentions or general EHS/regulatory compliance without carbon/LCA standards",
            "Solid execution of GHG accounting (Scope 1-3), ISO 14064/14040 compliance, or corporate ESG disclosures",
            "Deep methodological authority authoring ISO 14040/44 LCAs, verified EPDs (EN 15804/PCR), PCFs, or global Scope 3 supply-chain models",
        ],
    },
    "project_depth": {
        "type": "score",
        "instructions": "Rate the depth and real-world impact of the candidate's LCA, decarbonization, or sustainability projects.",
        "criteria": [
            "No relevant environmental or sustainability projects",
            "Academic lab studies, university coursework, or general plant EHS/wastewater monitoring only",
            "Commercial ESG advisory, corporate carbon footprint inventories, or product compliance projects",
            "Lead LCA practitioner delivering commercial cradle-to-grave LCAs, 10+ published EPDs, or industrial decarbonization roadmaps",
        ],
    },
}

UIUX_QUESTIONS: dict[str, dict[str, Any]] = {
    "has_figma_wireframing": {
        "type": "noul",
        "instructions": "Does the candidate have practical experience with Figma, wireframing, interactive prototyping, or UI design tools?",
    },
    "has_portfolio_projects": {
        "type": "noul",
        "instructions": "Does the candidate describe concrete digital product design, mobile/web app UI/UX projects, or UX case studies?",
    },
    "is_pure_graphic_or_unrelated": {
        "type": "noul",
        "instructions": "Is the candidate either completely outside design (e.g. LCA/environmental engineer, banker) OR focused almost exclusively on static graphic design/print/social media creatives rather than interactive digital product UX?",
    },
    "ui_craft_and_systems": {
        "type": "score",
        "instructions": "Rate the candidate's UI visual craft, Figma proficiency, component library architecture, and design systems capability.",
        "criteria": [
            "No UI design or Figma skills",
            "Basic graphic layouts, Canva/social media assets, or beginner wireframes without component systems",
            "Competent digital UI craft in Figma with responsive web/mobile screens, auto-layout, and interactive prototypes",
            "Advanced design systems, reusable multi-brand token/component libraries, 3D/motion/micro-interactions, or shipped production interfaces",
        ],
    },
    "ux_research_methods": {
        "type": "score",
        "instructions": "Rate the candidate's UX research methodology, user testing, information architecture, and accessibility (WCAG) practices.",
        "criteria": [
            "No user research or UX methodology mentioned",
            "Basic mentions of personas or wireframes without structured research or testing",
            "Applied UX research including user flows, heuristic UX audits, information architecture, and usability testing",
            "Rigorous multi-method UX research, user interviews across demographics, accessibility (WCAG) compliance, and iterative validation",
        ],
    },
    "product_thinking": {
        "type": "score",
        "instructions": "Rate the candidate's end-to-end digital product thinking, complex workflow problem-solving, and developer handoff/collaboration.",
        "criteria": [
            "No digital product design experience",
            "Surface-level visual screens or static marketing graphics without product flow depth",
            "Clear end-to-end user journeys, B2B/consumer app case studies, and cross-functional developer collaboration",
            "Strong product ownership shipping real SaaS/fintech/AI products, measurable conversion/retention impact, or design engineering",
        ],
    },
}


def _score_to_100(ans: dict[str, Any] | None, max_level: int = 3) -> float:
    if not ans:
        return 0.0
    raw = float(ans.get("score", 0.0))
    if raw > max_level:
        return round(max(0.0, min(100.0, raw)), 1)
    return round(max(0.0, min(100.0, (raw / max_level) * 100.0)), 1)


def _noul_prob(ans: dict[str, Any] | None, default: float = 0.0) -> float:
    if not ans:
        return default
    return round(float(ans.get("noul", default)), 4)


def heuristic_decision_fallback(stage1: Stage1Extraction) -> dict[str, dict[str, Any]]:
    """Synthesize structured System 1 decision answers from Stage 1 metadata when external LLM keys are unconfigured or offline."""
    skills_lower = " ".join(s.lower() for s in stage1.skills_and_tools)
    text_lower = stage1.healed_text.lower()
    combined = f"{skills_lower} {text_lower}"

    has_lca_sw = any(w in combined for w in ("simapro", "gabi", "openlca", "umberto", "ecoinvent"))
    has_lca_std = any(w in combined for w in ("iso 14040", "iso 14044", "iso 14064", "iso 14067", "ghg protocol", "scope 1", "scope 2", "scope 3", "epd", "pcf", "life cycle assessment"))
    has_figma = any(w in combined for w in ("figma", "wirefram", "prototyp", "design system", "ui/ux", "user interface"))
    has_ux_res = any(w in combined for w in ("user research", "usability test", "information architecture", "user flow", "case stud", "product design"))

    lca_bullets = len(stage1.lca_evidence_bullets)
    uiux_bullets = len(stage1.uiux_evidence_bullets)

    is_lca_relevant = has_lca_sw or has_lca_std or lca_bullets > 0
    is_uiux_relevant = has_figma or has_ux_res or uiux_bullets > 0

    return {
        "lca__has_lca_software": {"type": "noul", "noul": 0.88 if has_lca_sw else 0.04},
        "lca__has_ghg_standards": {"type": "noul", "noul": 0.90 if has_lca_std else 0.05},
        "lca__is_unrelated_domain": {"type": "noul", "noul": 0.06 if is_lca_relevant else 0.94},
        "lca__software_and_data_mastery": {"type": "score", "score": 2.3 if has_lca_sw else (0.8 if has_lca_std else 0.1), "confidence": 0.5},
        "lca__methodology_and_standards": {"type": "score", "score": 2.4 if has_lca_std else (0.8 if has_lca_sw else 0.1), "confidence": 0.5},
        "lca__project_depth": {"type": "score", "score": min(3.0, 1.0 + lca_bullets * 0.7) if is_lca_relevant else 0.1, "confidence": 0.5},
        "uiux__has_figma_wireframing": {"type": "noul", "noul": 0.88 if has_figma else 0.04},
        "uiux__has_portfolio_projects": {"type": "noul", "noul": 0.82 if has_ux_res else (0.65 if uiux_bullets > 0 else 0.05)},
        "uiux__is_pure_graphic_or_unrelated": {"type": "noul", "noul": 0.06 if is_uiux_relevant else 0.94},
        "uiux__ui_craft_and_systems": {"type": "score", "score": 2.3 if has_figma else 0.1, "confidence": 0.5},
        "uiux__ux_research_methods": {"type": "score", "score": 2.1 if has_ux_res else (1.0 if uiux_bullets > 0 else 0.1), "confidence": 0.5},
        "uiux__product_thinking": {"type": "score", "score": 2.2 if (has_figma and has_ux_res) else (1.4 if is_uiux_relevant else 0.1), "confidence": 0.5},
    }


def compute_lca_match(
    jev_answers: dict[str, dict[str, Any]],
    relevant_years: float,
    evidence_bullets: list[str],
) -> RoleMatchResult:
    has_answers = bool(jev_answers)
    has_sw = _noul_prob(jev_answers.get("lca__has_lca_software") or jev_answers.get("has_lca_software"))
    has_std = _noul_prob(jev_answers.get("lca__has_ghg_standards") or jev_answers.get("has_ghg_standards"))
    is_unrel = _noul_prob(
        jev_answers.get("lca__is_unrelated_domain") or jev_answers.get("is_unrelated_domain"),
        default=0.95 if (not has_answers or (has_sw < 0.2 and has_std < 0.2)) else 0.0,
    )

    s_sw = _score_to_100(jev_answers.get("lca__software_and_data_mastery") or jev_answers.get("software_and_data_mastery"))
    s_std = _score_to_100(jev_answers.get("lca__methodology_and_standards") or jev_answers.get("methodology_and_standards"))
    s_proj = _score_to_100(jev_answers.get("lca__project_depth") or jev_answers.get("project_depth"))

    confs = [
        float((jev_answers.get(f"lca__{k}") or jev_answers.get(k) or {}).get("confidence", 0.0))
        for k in ("software_and_data_mastery", "methodology_and_standards", "project_depth")
        if (jev_answers.get(f"lca__{k}") or jev_answers.get(k))
    ]
    avg_conf = round(sum(confs) / len(confs), 3) if confs else (0.8 if has_answers else 0.0)

    # Raw rubric composite (0 - 100)
    raw_composite = 0.40 * s_sw + 0.35 * s_std + 0.25 * s_proj

    # Gate modulation (soft continuous gate + unrelated domain suppression)
    hard_gates_passed = (has_sw >= 0.40 or has_std >= 0.45) and (is_unrel < 0.70)
    if is_unrel >= 0.85 and has_sw < 0.20 and has_std < 0.20:
        gate_factor = 0.15
    elif not hard_gates_passed:
        gate_factor = 0.55
    elif has_sw >= 0.75 and has_std >= 0.75:
        gate_factor = 1.05
    else:
        gate_factor = 0.92 + 0.08 * max(has_sw, has_std)

    calibrated_base = min(100.0, raw_composite * gate_factor)

    # Experience multipliers per docs/spec.md
    y = relevant_years
    if y < 2.0:
        mult_jd = 0.60 + 0.20 * y
    else:
        mult_jd = 1.00

    if y < 2.0:
        mult_prompt = 0.50 + 0.25 * (y / 2.0)
    elif y < 4.0:
        mult_prompt = 0.75 + 0.25 * ((y - 2.0) / 2.0)
    else:
        mult_prompt = 1.00

    score_jd = round(min(100.0, calibrated_base * mult_jd), 1)
    score_prompt = round(min(100.0, calibrated_base * mult_prompt), 1)

    # Classification uses the JD score; the UI can rank by either target.
    overall = score_jd

    if y < 2.0:
        seniority_flag: Literal["underqualified", "target_band", "overqualified"] = "underqualified"
    elif y > 7.5:
        seniority_flag = "overqualified"
    else:
        seniority_flag = "target_band"

    if overall >= 65 and hard_gates_passed:
        tier: Literal["strong_match", "potential_match", "mismatch", "uncertain"] = "strong_match"
    elif overall >= 38 and (hard_gates_passed or has_std >= 0.30 or s_proj >= 35):
        tier = "potential_match"
    else:
        tier = "mismatch"

    # Synthesize deterministic rationale headline
    if tier == "strong_match":
        sw_tag = "dedicated LCA modeling (SimaPro/GaBi/openLCA)" if has_sw >= 0.6 else "strong GHG/ISO methodology"
        headline = f"Strong LCA/Sustainability fit ({y:.1f}y relevant exp) anchored by {sw_tag} and {s_std:.0f}/100 standards execution."
    elif tier == "potential_match":
        if y < 1.5 and has_sw >= 0.6:
            headline = f"Hands-on LCA tool proficiency ({s_sw:.0f}/100) with early-career tenure ({y:.1f}y relevant exp)."
        elif has_sw < 0.4:
            headline = f"Adjacent ESG/environmental background ({y:.1f}y exp, {s_std:.0f}/100 standards) but limited dedicated LCA modeling software."
        else:
            headline = f"Moderate LCA/Sustainability match ({y:.1f}y relevant exp) with partial tool and standards coverage."
    else:
        headline = f"Low alignment for LCA Consultant (software gate {has_sw*100:.0f}%, standards gate {has_std*100:.0f}%)."

    return RoleMatchResult(
        role_id="lca_consultant",
        match_tier=tier,
        overall_score=overall,
        score_variants={"jd_2_3y": score_jd, "prompt_4_6y": score_prompt},
        sub_scores={
            "software_and_data_mastery": s_sw,
            "methodology_and_standards": s_std,
            "project_depth": s_proj,
        },
        gate_probabilities={
            "has_lca_software": round(has_sw, 3),
            "has_ghg_standards": round(has_std, 3),
            "is_unrelated_domain": round(is_unrel, 3),
        },
        hard_gates_passed=hard_gates_passed,
        seniority_flag=seniority_flag,
        jev_confidence=avg_conf,
        evidence_bullets=evidence_bullets[:4],
        rationale_headline=headline,
    )


def compute_uiux_match(
    jev_answers: dict[str, dict[str, Any]],
    relevant_years: float,
    evidence_bullets: list[str],
) -> RoleMatchResult:
    has_answers = bool(jev_answers)
    has_figma = _noul_prob(jev_answers.get("uiux__has_figma_wireframing") or jev_answers.get("has_figma_wireframing"))
    has_port = _noul_prob(jev_answers.get("uiux__has_portfolio_projects") or jev_answers.get("has_portfolio_projects"))
    is_pure_gfx = _noul_prob(
        jev_answers.get("uiux__is_pure_graphic_or_unrelated") or jev_answers.get("is_pure_graphic_or_unrelated"),
        default=0.95 if (not has_answers or (has_figma < 0.2 and has_port < 0.2)) else 0.0,
    )

    s_craft = _score_to_100(jev_answers.get("uiux__ui_craft_and_systems") or jev_answers.get("ui_craft_and_systems"))
    s_res = _score_to_100(jev_answers.get("uiux__ux_research_methods") or jev_answers.get("ux_research_methods"))
    s_prod = _score_to_100(jev_answers.get("uiux__product_thinking") or jev_answers.get("product_thinking"))

    confs = [
        float((jev_answers.get(f"uiux__{k}") or jev_answers.get(k) or {}).get("confidence", 0.0))
        for k in ("ui_craft_and_systems", "ux_research_methods", "product_thinking")
        if (jev_answers.get(f"uiux__{k}") or jev_answers.get(k))
    ]
    avg_conf = round(sum(confs) / len(confs), 3) if confs else (0.8 if has_answers else 0.0)

    raw_composite = 0.45 * s_craft + 0.15 * s_res + 0.40 * s_prod

    hard_gates_passed = (has_figma >= 0.50 and has_port >= 0.40) and (is_pure_gfx < 0.75)
    if is_pure_gfx >= 0.85 and has_figma < 0.25:
        gate_factor = 0.12
    elif not hard_gates_passed:
        gate_factor = 0.65 if has_figma >= 0.50 else 0.30
    elif has_figma >= 0.90 and has_port >= 0.90 and is_pure_gfx < 0.10:
        gate_factor = 1.15
    elif has_figma >= 0.80 and has_port >= 0.80:
        gate_factor = 1.08
    else:
        gate_factor = 0.95 + 0.05 * min(has_figma, has_port)

    # Multiplier = 1.00 across all Y per docs/spec.md (evaluate raw craft honestly)
    overall = round(min(100.0, raw_composite * gate_factor), 1)

    if relevant_years > 2.0:
        seniority_flag: Literal["underqualified", "target_band", "overqualified"] = "overqualified"
    else:
        seniority_flag = "target_band"

    if overall >= 65 and hard_gates_passed:
        tier: Literal["strong_match", "potential_match", "mismatch", "uncertain"] = "strong_match"
    elif overall >= 38 and has_figma >= 0.40:
        tier = "potential_match"
    else:
        tier = "mismatch"

    if tier == "strong_match":
        ov_note = f" [Overqualified: {relevant_years:.1f}y exp vs 0–1y intern target]" if seniority_flag == "overqualified" else f" ({relevant_years:.1f}y exp, target intern band)"
        headline = f"Strong UI/UX craft ({s_craft:.0f}/100 systems, {s_prod:.0f}/100 product thinking){ov_note}."
    elif tier == "potential_match":
        if is_pure_gfx >= 0.65:
            headline = f"Visual/graphic design focus ({relevant_years:.1f}y exp) with limited end-to-end digital product UX case studies."
        else:
            headline = f"Developing UI/UX profile ({relevant_years:.1f}y exp) with foundational Figma skills ({s_craft:.0f}/100) but sparse case study depth."
    else:
        headline = f"Low alignment for UI/UX Design Intern (Figma gate {has_figma*100:.0f}%, portfolio gate {has_port*100:.0f}%)."

    return RoleMatchResult(
        role_id="uiux_intern",
        match_tier=tier,
        overall_score=overall,
        score_variants={"intern_0_1y": overall, "strict_intern_cap": round(overall * 0.75, 1) if seniority_flag == "overqualified" else overall},
        sub_scores={
            "ui_craft_and_systems": s_craft,
            "ux_research_methods": s_res,
            "product_thinking": s_prod,
        },
        gate_probabilities={
            "has_figma_wireframing": round(has_figma, 3),
            "has_portfolio_projects": round(has_port, 3),
            "is_pure_graphic_or_unrelated": round(is_pure_gfx, 3),
        },
        hard_gates_passed=hard_gates_passed,
        seniority_flag=seniority_flag,
        jev_confidence=avg_conf,
        evidence_bullets=evidence_bullets[:4],
        rationale_headline=headline,
    )


def _detect_crossover_badges(
    healed_text: str,
    primary_role: str,
    lca_eval: RoleMatchResult,
    uiux_eval: RoleMatchResult,
) -> list[str]:
    badges: list[str] = []
    text_lower = healed_text.lower()

    # Check explicit spec crossover rules & domain hybrid signals
    if primary_role == "uiux_intern":
        if (
            (25.0 <= lca_eval.overall_score <= 55.0)
            or any(w in text_lower for w in ("sustainability", "sustainable", "textile", "carbon", "esg", "climate"))
        ):
            badges.append("Domain Crossover: Sustainability × Design")
        if any(w in text_lower for w in ("react", "next.js", "shadcn", "frontend", "full stack", "javascript", "typescript")):
            badges.append("Domain Crossover: Design × Frontend Engineering")
    elif primary_role == "lca_consultant":
        if any(w in text_lower for w in ("backend logic", "application development", "saas", "software", "catena-x", "cbam reporting module", "esg konnect")):
            badges.append("Domain Crossover: LCA × Software Engineering")
        if 25.0 <= uiux_eval.overall_score <= 55.0:
            badges.append("Domain Crossover: LCA × UI/UX")

    return badges


def aggregate_candidate(
    candidate_id: str,
    filename: str,
    content_hash: str,
    source_url: str | None,
    parse_status: Literal["ok", "empty_document", "scanned_pdf", "corrupted"],
    parse_diagnostics: str | None,
    raw_text: str,
    stage1: Stage1Extraction | None,
    jev_answers: dict[str, dict[str, Any]] | None,
) -> EvaluatedCandidate:
    words = raw_text.split()
    word_count = len(words)

    # Extract initials/alias from filename or first line
    m_alias = re.search(r"anonymized_([A-Za-z]+)_", filename)
    if m_alias and m_alias.group(1).lower() != "resume":
        alias = m_alias.group(1).upper()
    elif words:
        lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
        first_line = lines[0] if lines else ""
        alias = first_line[:12] if len(first_line) <= 12 else "".join(w[0].upper() for w in first_line.split()[:3] if w)
        if not alias:
            alias = "CANDIDATE"
    else:
        alias = "EMPTY"

    # Handle empty / unreadable document immediately
    is_empty = parse_status != "ok" or word_count == 0 or not raw_text.strip()
    is_ultra_sparse = word_count < 10
    if is_empty or stage1 is None or jev_answers is None:
        empty_lca = RoleMatchResult(
            role_id="lca_consultant",
            match_tier="uncertain",
            overall_score=0.0,
            score_variants={"jd_2_3y": 0.0, "prompt_4_6y": 0.0},
            sub_scores={"software_and_data_mastery": 0.0, "methodology_and_standards": 0.0, "project_depth": 0.0},
            gate_probabilities={"has_lca_software": 0.0, "has_ghg_standards": 0.0, "is_unrelated_domain": 1.0},
            hard_gates_passed=False,
            seniority_flag="underqualified",
            jev_confidence=0.0,
            evidence_bullets=[],
            rationale_headline=f"Unreadable or empty file ({parse_status}): routed to Human Review Queue.",
        )
        empty_uiux = RoleMatchResult(
            role_id="uiux_intern",
            match_tier="uncertain",
            overall_score=0.0,
            score_variants={"intern_0_1y": 0.0, "strict_intern_cap": 0.0},
            sub_scores={"ui_craft_and_systems": 0.0, "ux_research_methods": 0.0, "product_thinking": 0.0},
            gate_probabilities={"has_figma_wireframing": 0.0, "has_portfolio_projects": 0.0, "is_pure_graphic_or_unrelated": 1.0},
            hard_gates_passed=False,
            seniority_flag="underqualified",
            jev_confidence=0.0,
            evidence_bullets=[],
            rationale_headline=f"Unreadable or empty file ({parse_status}): routed to Human Review Queue.",
        )
        return EvaluatedCandidate(
            candidate_id=candidate_id,
            filename=filename,
            content_hash=content_hash,
            source_url=source_url,
            parse_status=parse_status,
            parse_diagnostics=parse_diagnostics or "Document contains 0 extractable words.",
            word_count=0,
            initials_or_alias=alias,
            healed_text="",
            education_summary="None (Empty Document)",
            skills_and_tools=[],
            key_projects_and_roles=[],
            crossover_badges=[],
            total_career_years=0.0,
            relevant_years_by_domain={"lca_consultant": 0.0, "uiux_intern": 0.0, "other": 0.0},
            primary_classification="neither_uncertain",
            needs_human_review=True,
            classification_reason=f"Empty or unreadable document ({parse_status}) — requires manual HR verification.",
            forensic_repairs=[],
            evaluations={"lca_consultant": empty_lca, "uiux_intern": empty_uiux},
            work_spans=[],
        )

    total_years, relevant_by_domain = compute_experience_years(stage1.work_spans)
    lca_eval = compute_lca_match(jev_answers, relevant_by_domain["lca_consultant"], stage1.lca_evidence_bullets)
    uiux_eval = compute_uiux_match(jev_answers, relevant_by_domain["uiux_intern"], stage1.uiux_evidence_bullets)

    # Classification & Triage rules per docs/spec.md
    is_sparse = word_count < 100
    low_conf = min(lca_eval.jev_confidence, uiux_eval.jev_confidence) < 0.25
    avg_conf = (lca_eval.jev_confidence + uiux_eval.jev_confidence) / 2.0

    lca_unrel = lca_eval.gate_probabilities.get("is_unrelated_domain", 1.0)
    uiux_unrel = uiux_eval.gate_probabilities.get("is_pure_graphic_or_unrelated", 1.0)
    lca_s = lca_eval.overall_score
    uiux_s = uiux_eval.overall_score
    is_confident_unrelated = (
        not is_empty
        and not is_ultra_sparse
        and not low_conf
        and avg_conf >= 0.75
        and lca_s < 35.0
        and uiux_s < 35.0
        and lca_unrel >= 0.70
        and uiux_unrel >= 0.70
        and not lca_eval.hard_gates_passed
        and not uiux_eval.hard_gates_passed
        and word_count >= 150
    )

    if is_sparse:
        primary_class: Literal["lca_consultant", "uiux_intern", "both", "neither_uncertain"] = "neither_uncertain"
        needs_human_review = True
        reason = f"Sparse profile ({word_count} words < 100-word threshold; missing Experience/Case Studies) — routed to Human Review Queue."
        lca_eval.match_tier = "uncertain"
        uiux_eval.match_tier = "uncertain"
    elif (
        lca_eval.hard_gates_passed
        and uiux_eval.hard_gates_passed
        and lca_eval.overall_score >= 60.0
        and uiux_eval.overall_score >= 60.0
    ):
        primary_class = "both"
        needs_human_review = False
        reason = f"Passes hard gates and scores >= 60 on both LCA ({lca_eval.overall_score}) and UI/UX ({uiux_eval.overall_score})."
    elif is_confident_unrelated:
        primary_class = "neither_uncertain"
        needs_human_review = False
        reason = f"Confident Reject: Both role scores < 35 (LCA {lca_eval.overall_score}, UI/UX {uiux_eval.overall_score}) with {total_years:.1f}y experience in unrelated domain."
    elif (
        lca_unrel >= 0.70
        and uiux_unrel >= 0.70
        and not lca_eval.hard_gates_passed
        and not uiux_eval.hard_gates_passed
    ):
        primary_class = "neither_uncertain"
        needs_human_review = True
        reason = f"Unrelated domain indicators across both roles (LCA {lca_eval.overall_score}, UI/UX {uiux_eval.overall_score}) — routed to Human Review Queue."
    elif (
        lca_eval.overall_score < 35.0
        and uiux_eval.overall_score < 35.0
        and not lca_eval.hard_gates_passed
        and not uiux_eval.hard_gates_passed
    ):
        primary_class = "neither_uncertain"
        needs_human_review = True
        reason = f"Scores below qualification threshold on both roles (LCA {lca_eval.overall_score}, UI/UX {uiux_eval.overall_score}) without passing domain gates — routed to Human Review Queue."
    elif lca_eval.overall_score >= uiux_eval.overall_score:
        primary_class = "lca_consultant"
        needs_human_review = False
        reason = f"Classified as LCA Consultant ({lca_eval.overall_score} vs UI/UX {uiux_eval.overall_score})."
    else:
        primary_class = "uiux_intern"
        needs_human_review = False
        reason = f"Classified as UI/UX Design Intern ({uiux_eval.overall_score} vs LCA {lca_eval.overall_score})."

    badges = _detect_crossover_badges(stage1.healed_text, primary_class, lca_eval, uiux_eval)

    return EvaluatedCandidate(
        candidate_id=candidate_id,
        filename=filename,
        content_hash=content_hash,
        source_url=source_url,
        parse_status=parse_status,
        parse_diagnostics=parse_diagnostics,
        word_count=word_count,
        initials_or_alias=alias,
        healed_text=stage1.healed_text,
        education_summary=stage1.education_summary,
        skills_and_tools=stage1.skills_and_tools,
        key_projects_and_roles=stage1.key_projects_and_roles,
        crossover_badges=badges,
        total_career_years=total_years,
        relevant_years_by_domain=relevant_by_domain,
        primary_classification=primary_class,
        needs_human_review=needs_human_review,
        classification_reason=reason,
        forensic_repairs=stage1.forensic_repairs,
        evaluations={"lca_consultant": lca_eval, "uiux_intern": uiux_eval},
        work_spans=stage1.work_spans,
    )
