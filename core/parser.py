import hashlib
import io
import re
from typing import Literal
import docx
from pypdf import PdfReader

from core.schemas import ForensicRepair

ParseStatus = Literal["ok", "empty_document", "scanned_pdf", "corrupted"]
ParsedDocument = tuple[str, ParseStatus, str | None]



def compute_content_hash(raw_text: str) -> str:
    """Deterministic SHA-256 hash of whitespace-normalized text."""
    normalized = re.sub(r"\s+", " ", raw_text).strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def parse_document_bytes(file_bytes: bytes, filename: str) -> tuple[str, ParseStatus, str | None]:
    """Parse .docx or .pdf strictly in-memory via io.BytesIO."""
    if not file_bytes or len(file_bytes.strip()) == 0:
        return "", "empty_document", "Uploaded file contains 0 bytes (empty document)."
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    try:
        if ext == "docx":
            doc = docx.Document(io.BytesIO(file_bytes))
            lines: list[str] = []
            for p in doc.paragraphs:
                if p.text and p.text.strip():
                    lines.append(p.text.strip())
            for table in doc.tables:
                for row in table.rows:
                    row_cells = [c.text.strip() for c in row.cells if c.text and c.text.strip()]
                    if row_cells:
                        lines.append(" | ".join(dict.fromkeys(row_cells)))
            raw_text = "\n".join(lines).strip()
            if not raw_text:
                return "", "empty_document", "Zero extractable words found in Word XML document."
            return raw_text, "ok", None

        elif ext == "pdf":
            reader = PdfReader(io.BytesIO(file_bytes))
            if getattr(reader, "is_encrypted", False):
                try:
                    res = reader.decrypt("")
                    if not res:
                        return "", "corrupted", f"Failed to parse {filename}: PDF file is encrypted with password protection."
                except Exception:
                    return "", "corrupted", f"Failed to parse {filename}: PDF file is encrypted with password protection."
            pages = [page.extract_text() or "" for page in reader.pages]
            raw_text = "\n".join(p.strip() for p in pages if p.strip()).strip()
            if not raw_text:
                return "", "scanned_pdf", "PDF contains no extractable text layer (likely scanned image or blank)."
            return raw_text, "ok", None

        else:
            raw_text = file_bytes.decode("utf-8", errors="ignore").strip()
            if not raw_text:
                return "", "empty_document", "File is empty."
            return raw_text, "ok", None
    except Exception as exc:
        return "", "corrupted", f"Failed to parse {filename}: {exc}"


# Mark damaged facts explicitly; context alone cannot recover their original values.
_DETERMINISTIC_REPAIRS: list[tuple[re.Pattern[str], str, str]] = [
    (
        re.compile(r"\bScope\s+s\b"),
        "Scope [numbers unreadable]",
        "Scope numbers were stripped; the original values cannot be verified",
    ),
    (
        re.compile(r"\bISO\s*/\s*s\b"),
        "ISO [standard numbers unreadable]",
        "ISO standard numbers were stripped; no specific standard is assumed",
    ),
    (
        re.compile(r"\baccordance with ISO\s+s\b"),
        "accordance with ISO [standard numbers unreadable]",
        "ISO standard numbers were stripped; no specific standard is assumed",
    ),
    (
        re.compile(r"\bover 2\.s\b"),
        "[experience duration unreadable]",
        "The damaged duration 'over 2.s' does not establish an exact number of years",
    ),
    (
        re.compile(r"\bISO\s+/\s*\(LCA\)"),
        "ISO [standard numbers unreadable] (LCA)",
        "LCA context does not establish which ISO standards were listed",
    ),
    (
        re.compile(r"\bISO\s+/-\s*compliant\b"),
        "ISO [standard numbers unreadable]-compliant",
        "ISO standard numbers were stripped; no specific standard is assumed",
    ),
    (
        re.compile(r"\bISO\s+/\s*(?=[,\n]|in trade-offs|$)"),
        "ISO [standard numbers unreadable]",
        "ISO standard numbers were stripped; no specific standard is assumed",
    ),
    (
        re.compile(r"\bISO\s+/\s+LCA\b"),
        "ISO [standard numbers unreadable] LCA",
        "LCA context does not establish which ISO standards were listed",
    ),
    (
        re.compile(r"\bstrict\s+ISO\s+and\s+methodologies\b"),
        "strict ISO [standard number unreadable] and [methodology unreadable] methodologies",
        "The standard and second methodology are missing from the source",
    ),
    (
        re.compile(r"\bEN\s+\+A2,\s*ISO\s*,\s*and\s*ISO\s*\."),
        "EN [standard number unreadable]+A2, ISO [standard number unreadable], and ISO [standard number unreadable].",
        "Standard numbers were stripped; the visible amendment is preserved",
    ),
    (
        re.compile(r"\bISO\s*:2006,\s*ISO\s*:2006\s+and\s+ISO\s*:2018\b"),
        "ISO [standard number unreadable]:2006, ISO [standard number unreadable]:2006 and ISO [standard number unreadable]:2018",
        "Edition years are preserved but do not identify the missing standards",
    ),
    (
        re.compile(r"\bISO\s+9001:2015,\s*ISO\s*:2015,\s*ISO\s*:2018\b"),
        "ISO 9001:2015, ISO [standard number unreadable]:2015, ISO [standard number unreadable]:2018",
        "The explicit ISO 9001 reference is preserved; other standard numbers are missing",
    ),
    (
        re.compile(r"\bISO\s*:\s*2015\b"),
        "ISO [standard number unreadable]:2015",
        "An edition year does not identify the missing ISO standard",
    ),
    (
        re.compile(r"\bISO\s*:2026\s+EMS\b"),
        "ISO [standard number unreadable]:2026 EMS",
        "EMS context does not verify the missing standard number; the source year is preserved",
    ),
    (
        re.compile(r"Catena\s*-\s*X\s+Rulebook\s+and\s+ISO\s*\."),
        "Catena-X Rulebook and ISO [standard number unreadable].",
        "Catena-X context does not verify the missing ISO standard number",
    ),
    (
        re.compile(r"\bISO\s+-\s+Managing the Carbon Footprint"),
        "ISO [standard number unreadable] - Managing the Carbon Footprint",
        "The course title is preserved without guessing its ISO standard number",
    ),
    (
        re.compile(r"\bISO\s+and\s+ISO\s+verification\b"),
        "ISO [standard number unreadable] and ISO [standard number unreadable] verification",
        "Verification context does not establish the missing ISO standard numbers",
    ),
    (
        re.compile(r"\bper\s+ISO\s+and\s+GHG\s+Protocol\b"),
        "per ISO [standard number unreadable] and GHG Protocol",
        "GHG Protocol is explicit; the ISO standard number is missing",
    ),
    (
        re.compile(r"\bISO\s{2,}Life Cycle Assessment\b"),
        "ISO [standard numbers unreadable] Life Cycle Assessment",
        "LCA context does not establish which ISO standards were listed",
    ),
    (
        re.compile(r"\bLead a team of s\b"),
        "Lead a team of [team roles unreadable]",
        "Team leadership is explicit; the team members' roles are missing",
    ),
    (
        re.compile(r"\bwith ry experience\b"),
        "with [word unreadable] experience",
        "The truncated word 'ry' cannot be recovered from the source",
    ),
    (
        re.compile(r"\beliminating 2,e\."),
        "eliminating [emissions figure unreadable].",
        "The damaged figure '2,e' does not establish a quantity or unit",
    ),
    (
        re.compile(r"\bimpact assessment of s worth\b"),
        "impact assessment of [subject unreadable] worth",
        "The subject of the valuation is missing from the source",
    ),
    (
        re.compile(r"\bfor 40-omers\."),
        "for [customer count unreadable].",
        "The damaged token '40-omers' does not verify an exact customer count",
    ),
    (
        re.compile(r"—\s*S K ILLS AN D TOOLS\s+Dec 2025"),
        "— [employer unreadable]   Dec 2025",
        "A skills section heading appears in the employer field; another role's employer is not assumed",
    ),
    (
        re.compile(r"(\u2014\s*[^\n]+?)\s+null\b"),
        r"\1   (Dates unlisted)",
        "Cleaned literal 'null' date string injected by resume scraper",
    ),
    (
        re.compile(r"(\u2014\s*[^\n]+?)\s+Not specified\b"),
        r"\1   (Dates unlisted)",
        "Normalized 'Not specified' scraper placeholder on project entries",
    ),
    (
        re.compile(r"(\u2014\s*[^\n]+?)\s+Dates not provided\b"),
        r"\1   (Dates unlisted)",
        "Normalized 'Dates not provided' scraper placeholder",
    ),
    (
        re.compile(r"\bNet Zero uring units\b"),
        "Net Zero [text unreadable] units",
        "The missing words in 'Net Zero uring units' cannot be verified",
    ),
    (
        re.compile(r"\bScope cular-economy objectives\b"),
        "Scope [text unreadable] circular-economy objectives",
        "The damaged phrase does not establish specific emission scopes",
    ),
    (
        re.compile(r"St\. Xavier's High School, Bhavnagar, 2016\s*-\s*2027"),
        "St. Xavier's High School, Bhavnagar, 2016 - 2027 [year needs verification]",
        "The source lists 2027; its apparent inconsistency does not establish a replacement year",
    ),
]


def apply_deterministic_repairs(raw_text: str) -> tuple[str, list[ForensicRepair]]:
    """Clean known artifacts and mark missing facts without guessing their values."""
    healed = raw_text
    repairs: list[ForensicRepair] = []
    for pattern, replacement, reason in _DETERMINISTIC_REPAIRS:
        match = pattern.search(healed)
        if match:
            raw_frag = match.group(0)
            healed = pattern.sub(replacement, healed)
            repairs.append(
                ForensicRepair(
                    raw_fragment=raw_frag.strip(),
                    repaired_value=match.expand(replacement).strip(),
                    reason=reason,
                )
            )
    return healed, repairs
