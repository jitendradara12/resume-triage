import asyncio
import glob
import json
import os
import sys
from pathlib import Path
import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.pipeline import ZOHO_FOLDER_URL, evaluate_resume_bytes
from core.schemas import EvaluatedCandidate


async def run_batch(concurrency: int = 5) -> list[EvaluatedCandidate]:
    load_dotenv()
    resume_files = sorted(glob.glob("resumes/*.docx"))
    print(f"Found {len(resume_files)} resume files in resumes/...")

    sem = asyncio.Semaphore(concurrency)
    results: list[EvaluatedCandidate] = []

    async with httpx.AsyncClient(timeout=60.0) as http_client:
        async def _eval_one(idx: int, path: str) -> EvaluatedCandidate:
            fname = os.path.basename(path)
            async with sem:
                with open(path, "rb") as f:
                    b = f.read()
                cand = await evaluate_resume_bytes(
                    file_bytes=b,
                    filename=fname,
                    source_url=ZOHO_FOLDER_URL,
                    http_client=http_client,
                )
                lca_s = cand.evaluations["lca_consultant"].overall_score
                uiux_s = cand.evaluations["uiux_intern"].overall_score
                print(
                    f"[{idx+1:02d}/{len(resume_files)}] {cand.initials_or_alias:5s} | {fname:36s} -> "
                    f"{cand.primary_classification:17s} | LCA={lca_s:5.1f} | UIUX={uiux_s:5.1f} | "
                    f"repairs={len(cand.forensic_repairs)} | HR={cand.needs_human_review}"
                )
                return cand

        tasks = [_eval_one(i, p) for i, p in enumerate(resume_files)]
        results = await asyncio.gather(*tasks)

    out_dir = Path("data")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "baseline_candidates.json"

    serialized = [c.model_dump(mode="json") for c in results]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(serialized, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(results)} evaluated candidates to {out_path}")
    return list(results)


if __name__ == "__main__":
    asyncio.run(run_batch())
