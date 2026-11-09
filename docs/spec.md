# Role Specifications & Benchmark Suite

> **Note:** Rubric weights, prompts, and curves are v1 hypotheses. Agents must test against `resumes/` and calibrate.

---

## 1. Role Requirements

### LCA Consultant
- **Target:** 2–3 yrs (JD) / 4–6 yrs (Prompt) in LCA / Sustainability.
- **Skills & Tools:** SimaPro, GaBi (Sphera), openLCA, Ecoinvent, ISO 14040/44, ISO 14064, GHG Protocol (Scope 1, 2, 3), EPDs, PCFs.

### UI/UX Design Intern
- **Target:** 0–1 yr in digital product design.
- **Skills & Tools:** Figma, wireframing, high-fidelity prototyping, design systems, user flows, usability testing.
- **Overqualification Policy:** >2 yrs experience or agency founders receive full craft score (multiplier = 1.00), but get flagged `seniority_flag: "overqualified"` with a UI toggle to filter them.

---

## 2. V1 Jev Question Specs (`typesafe-sdk`)

### LCA Consultant
- **`has_lca_software` (Noul):** Verifiable hands-on experience with SimaPro, GaBi, openLCA, or Umberto?
- **`has_ghg_standards` (Noul):** Direct knowledge of ISO 14040/44, GHG Protocol (Scope 1-3), or EPDs?
- **`is_unrelated_domain` (Noul):** Candidate has no relevant sustainability/environmental foundation?
- **`software_and_data_mastery` (Score):** [no software, academic exposure, applied openLCA/SimaPro, expert industry modeling].
- **`methodology_and_standards` (Score):** [no standards, superficial keywords, direct ISO/GHG execution, authoring EPD/PCF frameworks].
- **`project_depth` (Score):** [no projects, academic lab study, multi-client engagements, lead analyst on global supply chains].

### UI/UX Design Intern
- **`has_figma_wireframing` (Noul):** Practical experience with Figma, wireframes, and prototypes?
- **`has_portfolio_projects` (Noul):** At least one documented product design case study?
- **`is_pure_graphic_or_unrelated` (Noul):** Purely graphic design (Canva/print/social) or unrelated domain?
- **`ui_craft_and_systems` (Score):** [rudimentary, competent layout/balance, advanced component systems, production design systems].
- **`ux_research_methods` (Score):** [no research, basic personas, usability testing & redesigns, rigorous multi-method research].
- **`product_thinking` (Score):** [superficial features, clear user journey, trade-off analysis & UX problem solving, shipped products].

---

## 3. Continuous Experience Multipliers

Let $Y = \text{relevant\_years\_by\_domain}[\text{role}]$.

- **LCA (JD Target, 2–3y):**
  - $Y < 2.0$: $0.60 + 0.20 \times Y$
  - $Y \ge 2.0$: $1.00$
- **LCA (Prompt Target, 4–6y):**
  - $Y < 2.0$: $0.50 + 0.25 \times (Y / 2.0)$
  - $2.0 \le Y < 4.0$: $0.75 + 0.25 \times ((Y - 2.0) / 2.0)$
  - $Y \ge 4.0$: $1.00$
- **UI/UX Internship (0–1y):**
  - Multiplier $= 1.00$ across all $Y$ (evaluates raw craft honestly without penalties).
  - If $Y > 2.0$: set `seniority_flag: "overqualified"`.

$$\text{score\_variants} = \text{jev\_subscore\_composite} \times \text{multiplier}$$

---

## 4. Deterministic Aggregator Rules

- **`both`:** `hard_gates_passed == True` and `overall_score >= 60` on **both** roles.
- **Domain Crossover Badge:** Passes gates for primary role, and scores $25 \le \text{score} \le 55$ on secondary role $\rightarrow$ primary classification + `"Domain Crossover: [Role A] x [Role B]"` badge.
- **Confident Reject (calibrated):** `parse_status == "ok"`, `word_count >= 100`, both role scores $< 25$, neither role's domain gates passed, and confidence $\ge 0.25$ for each role $\rightarrow$ `neither_uncertain`, `needs_human_review = False`. Unrelated-domain probabilities do not block this rule. A separate 75% average-confidence requirement is not used.
- **Human Review Queue:** `parse_status != "ok"`, `word_count < 100`, or unresolved nonmatches, including borderline scores or confidence $< 0.25$ for either role $\rightarrow$ `needs_human_review = True`.

---

## 5. Audited Ground-Truth Benchmark Cases

| Candidate / File | Ground Truth | Expected Bucket | Expected Triage / Flags |
| :--- | :--- | :--- | :--- |
| `1793685080327.docx` | 0-byte empty document | `neither_uncertain` | `needs_human_review: true`, `parse_status: "empty_document"` |
| `PS` (`1793682784387`) | Axis Bank Risk Manager | `neither_uncertain` | `needs_human_review: false` (Confident Reject), score $< 35$ |
| `BS` (`1793685080461`) | 3+ yr Founder / Lead Designer | `uiux_intern` | High score ($\ge 85$), `seniority_flag: "overqualified"` |
| `PKG` (`1793682784369`) | IIT Dhanbad TA (0y industry) | `lca_consultant` | `seniority_flag: "underqualified"` on 4–6y band |
| `APS` (`1793685080222`) | UI/UX Designer + Sustainability SaaS project | `uiux_intern` | `crossover_badges: ["Domain Crossover: Sustainability × Design"]` |
| `RR` (`1793682784428`) | LCA Consultant building PCF software app | `lca_consultant` | `crossover_badges: ["Domain Crossover: LCA × Software Engineering"]` |
| `KN` (`1793685080310`) | 84-word barebones education-only profile | `neither_uncertain` | `needs_human_review: true` (`"Sparse profile"`) |
| `HM`, `SS`, `HD` | Regex-stripped tokens (`"Scope s"`, `"ISO  "`) | Respective domain | `forensic_repairs` must contain $\ge 1$ repaired entry |
