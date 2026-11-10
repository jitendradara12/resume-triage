import asyncio
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api.index import app
from core.clients import run_stage1_extraction
from core.parser import apply_deterministic_repairs, compute_content_hash, parse_document_bytes
from core.schemas import EvaluatedCandidate, Stage1Extraction, WorkSpan
from core.scoring import (
    DECISION_QUESTIONS,
    aggregate_candidate,
    build_decision_state,
    compute_experience_years,
    compute_lca_match,
)

BASELINE_PATH = ROOT / "data" / "baseline_candidates.json"


class TestBenchmarkSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert BASELINE_PATH.exists(), "data/baseline_candidates.json missing"
        with open(BASELINE_PATH, "r", encoding="utf-8") as f:
            raw_list = json.load(f)
        cls.raw_list = raw_list
        cls.candidates = {c["filename"]: EvaluatedCandidate.model_validate(c) for c in raw_list}
        cls.client = TestClient(app)

    def test_01_baseline_count(self):
        self.assertEqual(len(self.raw_list), 47, f"Expected 47 candidates, got {len(self.raw_list)}")

    def test_02_empty_document_benchmark(self):
        # 1. 1793685080327.docx -> empty_document, neither_uncertain, needs_human_review=True
        dead = self.candidates["anonymized_resume_1793685080327.docx"]
        self.assertEqual(dead.parse_status, "empty_document")
        self.assertEqual(dead.primary_classification, "neither_uncertain")
        self.assertTrue(dead.needs_human_review)
        self.assertEqual(dead.word_count, 0)

    def test_03_confident_reject_axis_bank(self):
        # 2. PS (1793682784387) -> Axis Bank Risk Manager -> Confident Reject
        ps = self.candidates["anonymized_PS_1793682784387.docx"]
        self.assertEqual(ps.primary_classification, "neither_uncertain")
        self.assertFalse(ps.needs_human_review)
        self.assertLess(ps.evaluations["lca_consultant"].overall_score, 35.0)
        self.assertLess(ps.evaluations["uiux_intern"].overall_score, 35.0)

    def test_04_overqualified_founder_bs(self):
        # 3. BS (1793685080461) -> 3+ yr Founder / Lead Designer -> uiux_intern, score >= 85, overqualified
        bs = self.candidates["anonymized_BS_1793685080461.docx"]
        self.assertEqual(bs.primary_classification, "uiux_intern")
        self.assertGreaterEqual(bs.evaluations["uiux_intern"].overall_score, 85.0)
        self.assertEqual(bs.evaluations["uiux_intern"].seniority_flag, "overqualified")

    def test_05_ta_underqualified_pkg(self):
        # Only the environmental internship counts; teaching does not establish industry LCA experience.
        pkg = self.candidates["anonymized_PKG_1793682784369.docx"]
        self.assertEqual(pkg.evaluations["lca_consultant"].seniority_flag, "underqualified")
        self.assertEqual(pkg.relevant_years_by_domain["lca_consultant"], 0.25)
        self.assertFalse(pkg.evaluations["lca_consultant"].hard_gates_passed)

    def test_06_crossover_badge_aps(self):
        # 5. APS (1793685080222) -> UI/UX Designer + Sustainability SaaS project -> crossover badge
        aps = self.candidates["anonymized_APS_1793685080222.docx"]
        self.assertEqual(aps.primary_classification, "uiux_intern")
        self.assertIn("Domain Crossover: Sustainability × Design", aps.crossover_badges)
        self.assertEqual(aps.evaluations["uiux_intern"].seniority_flag, "overqualified")

    def test_07_crossover_badge_rr(self):
        # 6. RR (1793682784428) -> LCA Consultant building PCF software app -> crossover badge
        rr = self.candidates["anonymized_RR_1793682784428.docx"]
        self.assertEqual(rr.primary_classification, "lca_consultant")
        self.assertIn("Domain Crossover: LCA × Software Engineering", rr.crossover_badges)
        self.assertEqual(rr.evaluations["lca_consultant"].seniority_flag, "underqualified")

    def test_08_sparse_profile_kn(self):
        # 7. KN (1793685080310) -> 84-word sparse profile -> neither_uncertain, needs_human_review=True
        kn = self.candidates["anonymized_KN_1793685080310.docx"]
        self.assertEqual(kn.primary_classification, "neither_uncertain")
        self.assertTrue(kn.needs_human_review)
        self.assertEqual(kn.word_count, 84)

    def test_09_forensic_repairs_audit(self):
        # 8. Forensic repairs on HM, SS, HD
        for fname in (
            "anonymized_HM_1793682784257.docx",
            "anonymized_SS_1793682784470.docx",
            "anonymized_HD_1793682784275.docx",
        ):
            self.assertGreaterEqual(len(self.candidates[fname].forensic_repairs), 1, f"Missing repairs on {fname}")

    def test_10_api_health_and_candidate_lookup(self):
        r_health = self.client.get("/api/health")
        self.assertEqual(r_health.status_code, 200)
        self.assertEqual(r_health.json()["baseline_count"], 47)

        r_candidates = self.client.get("/api/candidates")
        self.assertEqual(r_candidates.status_code, 200)
        self.assertEqual(len(r_candidates.json()), 47)

        ps_cand = self.candidates["anonymized_PS_1793682784387.docx"]
        r_single = self.client.get(f"/api/candidates/{ps_cand.candidate_id}")
        self.assertEqual(r_single.status_code, 200)
        self.assertEqual(r_single.json()["initials_or_alias"], "PS")

    def test_11_api_baseline_deduplication_trap(self):
        with open(ROOT / "resumes" / "anonymized_HM_1793682784257.docx", "rb") as f:
            r_eval = self.client.post(
                "/api/evaluate",
                files={"file": ("reupload_HM.docx", f.read(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            )
        self.assertEqual(r_eval.status_code, 200)
        body = r_eval.json()
        self.assertTrue(body["matched_baseline"])
        self.assertIn("Matched Baseline Candidate", body["notice"])
        self.assertEqual(body["candidate"]["initials_or_alias"], "HM")

    def test_12_empty_upload_parsing(self):
        # 0-byte file upload returns empty_document and neither_uncertain
        text, status, diag = parse_document_bytes(b"", "empty_test.docx")
        self.assertEqual(status, "empty_document")
        self.assertEqual(text, "")

        r_empty = self.client.post(
            "/api/evaluate",
            files={"file": ("brand_new_empty.docx", b"", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )
        self.assertEqual(r_empty.status_code, 200)
        empty_body = r_empty.json()
        self.assertEqual(empty_body["candidate"]["parse_status"], "empty_document")
        self.assertTrue(empty_body["candidate"]["needs_human_review"])
        self.assertEqual(empty_body["candidate"]["primary_classification"], "neither_uncertain")

    def test_13_overlapping_interval_math(self):
        # Two 1-year roles overlapping by 6 months -> union must be 1.5 years (18 months), not 2.0 years
        spans = [
            WorkSpan(title="LCA Analyst", organization="Company A", start_date="2022-01", end_date="2023-01", months_duration=12, domain="lca_sustainability", is_internship=False),
            WorkSpan(title="LCA Consultant", organization="Company B", start_date="2022-06", end_date="2023-06", months_duration=12, domain="lca_sustainability", is_internship=False),
            WorkSpan(title="Teaching Assistant", organization="University", start_date="2023-06", end_date="2024-06", months_duration=12, domain="lca_sustainability", is_internship=True),
        ]
        total, by_dom = compute_experience_years(spans)
        self.assertEqual(total, 1.5)
        self.assertEqual(by_dom["lca_consultant"], 1.5)

    def test_14_deterministic_repairs_logic(self):
        raw = "We measured Scope s emissions according to ISO / s."
        healed, repairs = apply_deterministic_repairs(raw)
        self.assertIn("Scope [numbers unreadable] emissions", healed)
        self.assertIn("ISO [standard numbers unreadable]", healed)
        self.assertEqual(len(repairs), 2)

    def test_repairs_preserve_uncertainty_and_explicit_facts(self):
        cases = [
            ("over 2.s", "[experience duration unreadable]"),
            ("eliminating 2,e.", "eliminating [emissions figure unreadable]."),
            ("for 40-omers.", "for [customer count unreadable]."),
            ("ISO :2015", "ISO [standard number unreadable]:2015"),
            ("ISO 9001:2015, ISO :2015, ISO :2018", "ISO 9001:2015, ISO [standard number unreadable]:2015, ISO [standard number unreadable]:2018"),
            ("St. Xavier's High School, Bhavnagar, 2016 - 2027", "St. Xavier's High School, Bhavnagar, 2016 - 2027 [year needs verification]"),
            ("UI/UX Designer — S K ILLS AN D TOOLS   Dec 2025", "UI/UX Designer — [employer unreadable]   Dec 2025"),
        ]
        for raw, expected in cases:
            with self.subTest(raw=raw):
                healed, repairs = apply_deterministic_repairs(raw)
                self.assertEqual(healed, expected)
                self.assertEqual(len(repairs), 1)
                self.assertIn(repairs[0].raw_fragment, raw)
                self.assertIn(repairs[0].repaired_value, healed)

        explicit = "ISO 14040/14044, Scope 1, 2, 3, 2.5 years, 2,000+ tCO2e, 2016 - 2018"
        self.assertEqual(apply_deterministic_repairs(explicit), (explicit, []))

    def test_extraction_cannot_repair_source_or_invent_evidence(self):
        raw = "Used Figma for prototypes.\nApplied ISO / s."
        payload = {
            "additional_forensic_repairs": [{"raw_fragment": "ISO [standard numbers unreadable]", "repaired_value": "ISO 14040/14044", "reason": "Guessed from LCA context"}],
            "education_summary": "Not listed",
            "skills_and_tools": ["Figma", "ISO 14040/14044"],
            "key_projects_and_roles": [],
            "work_spans": [],
            "lca_evidence_bullets": ["Applied ISO 14040/14044."],
            "uiux_evidence_bullets": ["Used Figma for prototypes.", "Built 40+ prototypes."],
        }
        client = Mock()
        client.models.generate_content.return_value = SimpleNamespace(text=json.dumps(payload))
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}), patch("core.clients.get_gemini_client", return_value=client):
            result = asyncio.run(run_stage1_extraction(raw))
        client.models.generate_content.assert_called_once()
        self.assertEqual(result.healed_text, "Used Figma for prototypes.\nApplied ISO [standard numbers unreadable].")
        self.assertEqual(result.forensic_repairs, apply_deterministic_repairs(raw)[1])
        self.assertEqual(result.skills_and_tools, ["Figma"])
        self.assertEqual(result.lca_evidence_bullets, [])
        self.assertEqual(result.uiux_evidence_bullets, ["Used Figma for prototypes."])

    def test_baseline_cleanup_matches_source(self):
        for candidate in self.candidates.values():
            with self.subTest(filename=candidate.filename):
                raw, _, _ = parse_document_bytes((ROOT / "resumes" / candidate.filename).read_bytes(), candidate.filename)
                healed, repairs = apply_deterministic_repairs(raw)
                self.assertEqual(candidate.healed_text, healed)
                self.assertEqual(candidate.forensic_repairs, repairs)

    def test_15_live_upload_fallback_classification_and_memory_lookup(self):
        from core.scoring import _parse_date_to_month_index
        self.assertIsNone(_parse_date_to_month_index("unknown"))

        import docx, io, os, unittest.mock
        doc = docx.Document()
        doc.add_heading("Senior Financial Risk Analyst - Portfolio Governance", 0)
        doc.add_paragraph("Seasoned banking analytics manager with extensive background overseeing delinquency forecasting, equity portfolios, and debt securitization across enterprise commercial lending divisions.")
        doc.add_paragraph("Delivered multi-currency econometric regression models, liquidity coverage ratio assessments, macroeconomic scenario simulations, and Basel III capital adequacy audits across tier-one credit institutions.")
        doc.add_paragraph("Experience: Senior Risk Analyst at Global Bank Corp from 2019 to 2024. Monitored risk-weighted assets exceeding 50 billion dollars, audited underwriting exceptions, and automated executive management reporting dashboards.")
        doc.add_paragraph("Led internal audit committees, prepared quarterly regulatory filings for federal financial oversight agencies, and executed comprehensive asset-liability duration matching across multiple investment funds.")
        doc.add_paragraph("Skills and Platforms: Proficient in Bloomberg Terminal, Capital IQ, Advanced Financial Modeling, SQL database queries, quantitative portfolio stress-testing, and corporate compliance governance.")
        doc.add_paragraph("Education: Master of Science in Finance and Quantitative Economics, Premier Business School, 2018.")
        doc.add_paragraph("Certifications: Chartered Financial Analyst (CFA Level III candidate), Financial Risk Manager (FRM certified), and licensed investment advisor.")
        doc.add_paragraph("Key Deliverables: Implemented real-time counterparty credit exposure alerts and structured hedge fund derivative settlements, preserving institutional capital during extreme macroeconomic market volatility periods.")
        buf = io.BytesIO()
        doc.save(buf)

        # Explicitly evaluate via fallback by clearing external LLM decision engine keys
        with unittest.mock.patch.dict(os.environ, {"GEMINI_API_KEY": "", "OPENROUTER_API_KEY": "", "TYPESAFE_API_KEY": ""}):
            r = self.client.post(
                "/api/evaluate",
                files={"file": ("john_doe_finance.docx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        cand = body["candidate"]
        self.assertGreaterEqual(cand["word_count"], 160)
        self.assertEqual(cand["primary_classification"], "neither_uncertain")
        self.assertFalse(cand["needs_human_review"])
        self.assertIn("Confident Reject", cand["classification_reason"])
        self.assertFalse(body["matched_baseline"])

        # Must be stored in memory and accessible via single-candidate GET endpoint
        r_get = self.client.get(f"/api/candidates/{cand['candidate_id']}")
        self.assertEqual(r_get.status_code, 200)
        self.assertEqual(r_get.json()["candidate_id"], cand["candidate_id"])

    def test_16_live_upload_lca_candidate_fallback(self):
        import docx, io
        doc = docx.Document()
        doc.add_heading("Dr. Jane Green - Life Cycle Assessment", 0)
        doc.add_paragraph("LCA Practitioner with extensive expertise in SimaPro, openLCA, GaBi, Ecoinvent, and ISO 14040/14044 standards.")
        doc.add_paragraph("Delivered cradle-to-gate Environmental Product Declarations (EPDs) and GHG Protocol Scope 1, 2, 3 carbon accounting across manufacturing and packaging supply chains.")
        doc.add_paragraph("Experience: Senior LCA Specialist at EcoConsult from 2021 to 2024. Modeled 25 product systems following strict ISO 14040/44 standards and published verified EPDs.")
        doc.add_paragraph("Skills and Methodologies: Proficient with SimaPro, openLCA, GaBi, Ecoinvent v3.9, EN 15804+A2, and corporate decarbonization roadmaps.")
        doc.add_paragraph("Education: Master of Science in Environmental Engineering, State University, 2020.")
        doc.add_paragraph("Key Projects: Led supply-chain carbon footprint analysis for automotive components, reducing life cycle impacts by 18%.")
        buf = io.BytesIO()
        doc.save(buf)

        r = self.client.post(
            "/api/evaluate",
            files={"file": ("jane_green_lca.docx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        )
        self.assertEqual(r.status_code, 200)
        cand = r.json()["candidate"]
        self.assertEqual(cand["primary_classification"], "lca_consultant")
        self.assertGreater(cand["evaluations"]["lca_consultant"]["overall_score"], 40.0)
        self.assertEqual(cand["evaluations"]["lca_consultant"]["seniority_flag"], "target_band")
        self.assertGreaterEqual(cand["relevant_years_by_domain"].get("lca_consultant", 0.0), 2.0)

    def test_17_encrypted_pdf_handling(self):
        import io
        from pypdf import PdfWriter
        writer = PdfWriter()
        writer.add_blank_page(width=100, height=100)
        writer.encrypt("secure_secret")
        buf = io.BytesIO()
        writer.write(buf)

        text, status, diag = parse_document_bytes(buf.getvalue(), "locked.pdf")
        self.assertEqual(status, "corrupted")
        self.assertIn("encrypted", diag.lower())

    def test_18_date_format_variations(self):
        from core.scoring import _parse_date_to_month_index
        # ISO YYYY-MM-DD
        idx_iso = _parse_date_to_month_index("2022-03-15")
        self.assertEqual(idx_iso, 2022 * 12 + 3)
        # MM/YYYY
        idx_rev = _parse_date_to_month_index("05/2021")
        self.assertEqual(idx_rev, 2021 * 12 + 5)
        # Ongoing synonyms
        idx_now = _parse_date_to_month_index("till now")
        self.assertIsNotNone(idx_now)
        # Verify word boundary protects substrings like summary/unknown
        self.assertNotEqual(_parse_date_to_month_index("summary 2021"), 2021 * 12 + 3)
        self.assertIsNone(_parse_date_to_month_index("summary"))
        self.assertIsNone(_parse_date_to_month_index("unknown"))

    def test_19_confident_rejection_boundaries(self):
        source = self.candidates["anonymized_PS_1793682784387.docx"]
        stage1 = Stage1Extraction(
            healed_text=source.healed_text,
            forensic_repairs=source.forensic_repairs,
            education_summary=source.education_summary,
            skills_and_tools=source.skills_and_tools,
            key_projects_and_roles=source.key_projects_and_roles,
            work_spans=source.work_spans,
            lca_evidence_bullets=[],
            uiux_evidence_bullets=[],
        )
        cases = [
            # words, parse, LCA score, UI/UX score, LCA gate, UI/UX gate, confidence, rejected
            (507, "ok", 1.7, 5.8, False, False, 0.51, True),
            (507, "ok", 0.5, 9.1, False, False, 0.63, True),
            (459, "ok", 0.4, 9.1, False, False, 0.503, True),
            (100, "ok", 2.0, 8.7, False, False, 0.5, True),
            (149, "ok", 24.9, 24.9, False, False, 0.5, True),
            (150, "ok", 25.0, 8.7, False, False, 0.9, False),
            (150, "ok", 2.0, 25.0, False, False, 0.9, False),
            (99, "ok", 2.0, 8.7, False, False, 0.9, False),
            (150, "ok", 2.0, 8.7, False, False, 0.1, False),
            (150, "ok", 2.0, 8.7, True, False, 0.9, False),
            (150, "ok", 2.0, 8.7, False, True, 0.9, False),
            (150, "corrupted", 2.0, 8.7, False, False, 0.9, False),
            (150, "scanned_pdf", 2.0, 8.7, False, False, 0.9, False),
            (0, "empty_document", 0.0, 0.0, False, False, 0.9, False),
        ]
        for words, status, lca_score, uiux_score, lca_gate, uiux_gate, confidence, rejected in cases:
            with self.subTest(case=(words, status, lca_score, uiux_score, lca_gate, uiux_gate, confidence)):
                evaluations = []
                for role, score, gate in (
                    ("lca_consultant", lca_score, lca_gate),
                    ("uiux_intern", uiux_score, uiux_gate),
                ):
                    evaluations.append(source.evaluations[role].model_copy(update={
                        "overall_score": score,
                        "hard_gates_passed": gate,
                        "jev_confidence": confidence,
                        "gate_probabilities": {
                            "is_unrelated_domain": 0.839,
                            "is_pure_graphic_or_unrelated": 0.574,
                        },
                    }))
                with patch("core.scoring.compute_lca_match", return_value=evaluations[0]), patch(
                    "core.scoring.compute_uiux_match", return_value=evaluations[1]
                ):
                    result = aggregate_candidate(
                        candidate_id="triage_test", filename="unrelated.pdf", content_hash="test",
                        source_url=None, parse_status=status, parse_diagnostics=None,
                        raw_text=" ".join((source.healed_text.split() * 2)[:words]),
                        stage1=stage1, jev_answers={},
                    )
                self.assertEqual(
                    result.primary_classification == "neither_uncertain" and not result.needs_human_review,
                    rejected,
                )
                if rejected:
                    self.assertIn("Confident Reject", result.classification_reason)

    def test_20_low_scores_and_failed_gates_reject_even_with_domain_adjacency(self):
        for alias in ("BA", "KA", "PD"):
            source = next(c for c in self.candidates.values() if c.initials_or_alias == alias)
            with self.subTest(alias=alias):
                stage1 = Stage1Extraction(
                    healed_text=source.healed_text, forensic_repairs=source.forensic_repairs,
                    education_summary=source.education_summary, skills_and_tools=source.skills_and_tools,
                    key_projects_and_roles=source.key_projects_and_roles, work_spans=source.work_spans,
                    lca_evidence_bullets=source.evaluations["lca_consultant"].evidence_bullets,
                    uiux_evidence_bullets=source.evaluations["uiux_intern"].evidence_bullets,
                )
                with patch("core.scoring.compute_lca_match", return_value=source.evaluations["lca_consultant"]), patch(
                    "core.scoring.compute_uiux_match", return_value=source.evaluations["uiux_intern"]
                ):
                    result = aggregate_candidate(
                        candidate_id=source.candidate_id, filename=source.filename, content_hash=source.content_hash,
                        source_url=source.source_url, parse_status="ok", parse_diagnostics=None,
                        raw_text=source.healed_text, stage1=stage1, jev_answers={},
                    )
                self.assertEqual(result.primary_classification, "neither_uncertain")
                self.assertFalse(result.needs_human_review)


    def test_21_lca_headlines_use_candidate_subscores(self):
        for candidate in self.candidates.values():
            saved = candidate.evaluations["lca_consultant"]
            if saved.match_tier != "strong_match":
                continue
            with self.subTest(alias=candidate.initials_or_alias):
                answers = {
                    key: {"noul": value} for key, value in saved.gate_probabilities.items()
                }
                answers.update({
                    key: {"score": value * 3 / 100} for key, value in saved.sub_scores.items()
                })
                result = compute_lca_match(
                    answers, candidate.relevant_years_by_domain["lca_consultant"], saved.evidence_bullets,
                )
                self.assertEqual(result.rationale_headline, saved.rationale_headline)
                self.assertNotIn("SimaPro/GaBi/openLCA", result.rationale_headline)

    def test_22_typesafe_system1_state_and_question_contracts(self):
        self.assertEqual(len(DECISION_QUESTIONS), 12)
        for q_id, q_spec in DECISION_QUESTIONS.items():
            if q_spec["type"] == "noul":
                self.assertIn("criteria", q_spec, f"Missing situational criteria on noul {q_id}")
                self.assertIn("true", q_spec["criteria"])
                self.assertIn("false", q_spec["criteria"])
            else:
                self.assertEqual(len(q_spec["criteria"]), 4)

        hm = self.candidates["anonymized_HM_1793682784257.docx"]
        stage1 = Stage1Extraction(
            healed_text=hm.healed_text,
            forensic_repairs=hm.forensic_repairs,
            education_summary=hm.education_summary,
            skills_and_tools=hm.skills_and_tools,
            key_projects_and_roles=hm.key_projects_and_roles,
            work_spans=hm.work_spans,
            lca_evidence_bullets=hm.evaluations["lca_consultant"].evidence_bullets,
            uiux_evidence_bullets=hm.evaluations["uiux_intern"].evidence_bullets,
        )
        state = build_decision_state(stage1)
        self.assertEqual(
            set(state.keys()),
            {
                "education_summary",
                "extracted_skills_and_tools",
                "key_projects_and_roles",
                "work_history",
                "lca_evidence_quotes",
                "uiux_evidence_quotes",
                "resume_text",
            },
        )
        for cand in self.candidates.values():
            if cand.primary_classification in ("lca_consultant", "uiux_intern"):
                role_eval = cand.evaluations[cand.primary_classification]
                self.assertIn(role_eval.match_tier, ("strong_match", "potential_match"))
                self.assertLess(role_eval.overall_score, 100.0)


def test_all_benchmark_assertions():
    """Backward compatibility entry point for pytest."""
    suite = unittest.TestLoader().loadTestsFromTestCase(TestBenchmarkSuite)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    assert result.wasSuccessful(), f"Tests failed: {len(result.errors)} errors, {len(result.failures)} failures"


if __name__ == "__main__":
    unittest.main()

