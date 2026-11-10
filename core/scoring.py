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
        "instructions": "Has the candidate used dedicated life cycle assessment (LCA) modeling software or life cycle inventory (LCI) databases to model environmental impacts?",
        "criteria": {
            "true": "The candidate has hands-on experience with specialized LCA tools (such as SimaPro, GaBi/Sphera, openLCA, or Umberto) or LCI databases (such as Ecoinvent, Agri-footprint, or GaBi databases) in `extracted_skills_and_tools`, `lca_evidence_quotes`, or `resume_text`.",
            "false": "The candidate only used generic spreadsheets (Excel), business intelligence tools (PowerBI/SQL), CAD/CAM software, air dispersion tools (AERMOD), laboratory instruments, chemical compliance portals (IMDS/RoHS/REACH), or has no environmental software experience.",
        },
    },
    "has_ghg_standards": {
        "type": "noul",
        "instructions": "Has the candidate executed life cycle assessments, product carbon footprints, or greenhouse gas emission inventories under ISO or GHG Protocol standards?",
        "criteria": {
            "true": "The candidate's work history, projects, or skills show direct execution of ISO 14040/14044 LCAs, ISO 14064/14067 carbon accounting, GHG Protocol (Scope 1, 2, or 3) emission inventories, Environmental Product Declarations (EPDs / EN 15804 / PCR), or Product Carbon Footprints (PCFs).",
            "false": "The candidate only worked on corporate ESG investment ratings and financial disclosures (GRI, SASB, TCFD, CSRD, EU Taxonomy) without Scope 1-3 emission inventories or LCAs, or worked on hazardous material compliance (RoHS/REACH/WEEE), cosmetic regulations, general plant EHS/stack monitoring, or academic solid-waste lab testing.",
        },
    },
    "is_unrelated_domain": {
        "type": "noul",
        "instructions": "Is this candidate's background outside environmental sustainability, life cycle assessment, climate, or ESG?",
        "criteria": {
            "true": "The candidate works primarily in an unrelated field such as banking credit risk, financial analytics, UI/UX or graphic design, pure software engineering without sustainability context, or cosmetic/chemical regulatory affairs without LCA or GHG work.",
            "false": "The candidate has professional or academic work in LCA, carbon accounting, ESG advisory, environmental engineering, or corporate sustainability.",
        },
    },
    "software_and_data_mastery": {
        "type": "score",
        "instructions": "What is the candidate's level of proficiency with LCA modeling software, LCI dataset compilation, and environmental impact databases?",
        "criteria": [
            "The candidate has no experience with LCA software (SimaPro, GaBi, openLCA), LCI datasets, or environmental modeling tools (for example: ESG ratings platforms, RoHS/IMDS portals, or unrelated software).",
            "The candidate has only academic coursework, environmental lab/air monitoring, or spreadsheet-only (Excel) environmental data tracking without dedicated LCA software.",
            "The candidate has applied SimaPro, GaBi, openLCA, or Ecoinvent on projects to build life cycle inventory models or calculate carbon and environmental footprints.",
            "The candidate is an experienced industry LCA modeler who has independently built commercial cradle-to-gate or cradle-to-grave LCI models in SimaPro, GaBi, or openLCA, validated operational/supply-chain datasets, and delivered multiple commercial LCA or EPD studies.",
        ],
    },
    "methodology_and_standards": {
        "type": "score",
        "instructions": "What is the candidate's depth of practice with LCA, EPD, and GHG accounting standards? (Do not credit unreadable placeholder brackets like `ISO [standard numbers unreadable]` as a specific ISO number unless explicitly named elsewhere.)",
        "criteria": [
            "The candidate shows no work with LCA, carbon accounting, or sustainability standards.",
            "The candidate works in general EHS safety, air pollution/stack monitoring (AERMOD), chemical material compliance (RoHS/REACH), or secondary ESG ratings/disclosure screening (GRI/SASB/EU Taxonomy) without executing LCA or GHG Protocol Scope 1-3 emissions inventories.",
            "The candidate has executed LCA studies, GHG Protocol (Scope 1, 2, or 3) emissions inventories, or corporate carbon footprint disclosures, or has unverified/redacted ISO placeholders without explicit EPD/PCF authorship.",
            "The candidate has explicitly authored or verified ISO 14040/14044 or ISO 14064/14067 studies, Environmental Product Declarations (EPDs / EN 15804 / PCR), Product Carbon Footprints (PCFs), or global Scope 3 supply-chain models.",
        ],
    },
    "project_depth": {
        "type": "score",
        "instructions": "What is the real-world depth of the candidate's delivered LCA, LCI data modeling, or carbon footprinting projects?",
        "criteria": [
            "The candidate has no environmental, sustainability, or LCA projects.",
            "The candidate has only university coursework, academic lab assistantships, plant EHS/wastewater/air monitoring, chemical compliance, or desktop ESG ratings QA without hands-on footprinting projects.",
            "The candidate has delivered commercial ESG advisory, corporate carbon footprint inventories, or environmental impact studies.",
            "The candidate has independently led or delivered multiple end-to-end commercial LCA studies, compiled plant and logistics LCI datasets across products, published EPDs, or built industrial decarbonization roadmaps.",
        ],
    },
}

UIUX_QUESTIONS: dict[str, dict[str, Any]] = {
    "has_figma_wireframing": {
        "type": "noul",
        "instructions": "Has the candidate used Figma or dedicated interface design tools to create wireframes, interactive prototypes, or digital UI screens?",
        "criteria": {
            "true": "The candidate has hands-on experience designing digital user interfaces, wireframes, interactive prototypes, or component libraries in Figma (or equivalent UI tools) as shown in `extracted_skills_and_tools`, `uiux_evidence_quotes`, or `resume_text`.",
            "false": "The candidate has no UI design tool experience, works in an unrelated field (such as LCA or banking), or only uses non-interface tools.",
        },
    },
    "has_portfolio_projects": {
        "type": "noul",
        "instructions": "Does the candidate describe concrete digital product design projects, web/mobile app interfaces, or UX case studies?",
        "criteria": {
            "true": "The candidate documents specific web, mobile, SaaS, or digital product design projects, screen designs, user flows, or UX case studies in `key_projects_and_roles`, `uiux_evidence_quotes`, or `work_history`.",
            "false": "The candidate lists no digital product or interface design projects (for example: an 84-word barebones resume with only education and skill keywords, or a non-design resume).",
        },
    },
    "is_pure_graphic_or_unrelated": {
        "type": "noul",
        "instructions": "Is the candidate either outside digital product design OR focused only on static graphic/print/social media creatives without interactive UI/UX work?",
        "criteria": {
            "true": "The candidate works in a non-design domain (such as environmental engineering, LCA consulting, or banking risk) OR only creates static graphic design assets (print flyers, logos, social media posts) with no web/app UI/UX design.",
            "false": "The candidate designs digital user interfaces, web or mobile application screens, interactive prototypes, or UX workflows.",
        },
    },
    "ui_craft_and_systems": {
        "type": "score",
        "instructions": "What is the candidate's level of digital UI visual craft, Figma proficiency, component library architecture, and design systems capability?",
        "criteria": [
            "No UI design or Figma experience.",
            "Basic graphic layouts, Canva/social media assets, or beginner wireframes without component systems.",
            "Competent digital UI craft in Figma with responsive web or mobile screens, auto-layout, and interactive prototypes.",
            "Advanced design systems, reusable multi-brand token/component libraries, 3D/motion/micro-interactions, or shipped production interfaces.",
        ],
    },
    "ux_research_methods": {
        "type": "score",
        "instructions": "What is the candidate's practice of UX research methodology, user interviews, usability testing, information architecture, and accessibility?",
        "criteria": [
            "No user research or UX methodology mentioned.",
            "Basic mentions of personas or wireframes without structured research or usability testing.",
            "Applied UX research including user flows, heuristic UX audits, information architecture, workflow friction analysis, or usability testing.",
            "Rigorous multi-method UX research, direct user interviews, accessibility (WCAG) compliance, or iterative validation driving measurable UX improvements.",
        ],
    },
    "product_thinking": {
        "type": "score",
        "instructions": "What is the depth of the candidate's end-to-end digital product thinking, workflow problem-solving, and cross-functional delivery?",
        "criteria": [
            "No digital product design experience.",
            "Surface-level visual screens or static marketing graphics without product flow depth.",
            "Clear end-to-end user journeys, B2B/consumer app case studies, and cross-functional developer collaboration.",
            "Strong product ownership shipping real SaaS/fintech/AI/consumer products, measurable user/conversion/efficiency impact, or design engineering.",
        ],
    },
}

DECISION_QUESTIONS: dict[str, dict[str, Any]] = {
    **{f"lca__{k}": v for k, v in LCA_QUESTIONS.items()},
    **{f"uiux__{k}": v for k, v in UIUX_QUESTIONS.items()},
}


def build_decision_state(stage1: Stage1Extraction) -> dict[str, Any]:
    """Build structured, non-duplicated System 1 decision state passing the TypeSafe human test."""
    return {
        "education_summary": stage1.education_summary,
        "extracted_skills_and_tools": stage1.skills_and_tools,
        "key_projects_and_roles": stage1.key_projects_and_roles,
        "work_history": [
            {
                "title": span.title,
                "organization": span.organization,
                "start_date": span.start_date,
                "end_date": span.end_date,
                "months_duration": span.months_duration,
                "domain": span.domain,
                "is_internship": span.is_internship,
            }
            for span in stage1.work_spans
        ],
        "lca_evidence_quotes": stage1.lca_evidence_bullets,
        "uiux_evidence_quotes": stage1.uiux_evidence_bullets,
        "resume_text": stage1.healed_text,
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
        gate_factor = 1.00
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
        headline = f"Strong LCA/Sustainability fit ({s_sw:.0f}/100 software and data, {s_std:.0f}/100 methods and standards, {s_proj:.0f}/100 project depth)."
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
    elif has_figma >= 0.80 and has_port >= 0.80:
        gate_factor = 1.00
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

    is_sparse = word_count < 100
    low_conf = min(lca_eval.jev_confidence, uiux_eval.jev_confidence) < 0.25

    lca_unrel = lca_eval.gate_probabilities.get("is_unrelated_domain", 1.0)
    uiux_unrel = uiux_eval.gate_probabilities.get("is_pure_graphic_or_unrelated", 1.0)
    lca_s = lca_eval.overall_score
    uiux_s = uiux_eval.overall_score
    is_confident_nonmatch = (
        not low_conf
        and word_count >= 100
        and lca_s < 25.0
        and uiux_s < 25.0
        and not lca_eval.hard_gates_passed
        and not uiux_eval.hard_gates_passed
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
    elif is_confident_nonmatch:
        primary_class = "neither_uncertain"
        needs_human_review = False
        reason = f"Confident Reject: Readable resume ({word_count} words), both role scores < 25 (LCA {lca_s}, UI/UX {uiux_s}), and neither role's domain gates passed."
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
