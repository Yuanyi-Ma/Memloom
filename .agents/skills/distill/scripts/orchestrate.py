#!/usr/bin/env python3
"""Deterministic production coordinator for the distill -> merge pipeline.

This script intentionally does not perform semantic extraction or merge
judgment. It runs the deterministic steps around those LLM calls, records a
resumable manifest, and stops at each LLM boundary with concrete input/output
files for the coordinator to hand to subagents.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


HELPER = Path(__file__).resolve().with_name("distill.py")
NONE_JUDGMENT = {
    "m1_judgment": "none",
    "m1_neighbors": [],
    "m1_merge_preview": None,
    "matched_canonical_id": None,
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_json(path: Path, default: Any | None = None) -> Any:
    if not path.exists():
        if default is not None:
            return default
        raise FileNotFoundError(path)
    text = path.read_text()
    if not text.strip() and default is not None:
        return default
    return json.loads(text)


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(path)


def emit(obj: Any) -> None:
    sys.stdout.write(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def fail(message: str) -> None:
    sys.exit(f"ERROR: {message}")


def slug(value: str) -> str:
    out = re.sub(r"[^A-Za-z0-9_.-]+", "_", value)
    return out.strip("_") or "session"


def run_helper(*args: str) -> Any:
    result = subprocess.run(
        [sys.executable, str(HELPER), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "helper command failed: "
            + " ".join(args)
            + f"\nstdout={result.stdout}\nstderr={result.stderr}"
        )
    return json.loads(result.stdout) if result.stdout.strip() else None


def manifest_path_arg(path: str | None) -> Path:
    if not path:
        fail("--manifest is required")
    return Path(path).expanduser().resolve()


def load_manifest(path: Path) -> dict[str, Any]:
    manifest = load_json(path)
    if not isinstance(manifest, dict):
        fail("manifest must be a JSON object")
    manifest["_manifest_path"] = str(path)
    return manifest


def save_manifest(manifest: dict[str, Any]) -> None:
    path = Path(manifest["_manifest_path"])
    clean = {k: v for k, v in manifest.items() if not k.startswith("_")}
    write_json(path, clean)


def read_sessions_file(path: Path) -> list[dict[str, Any]]:
    raw = load_json(path)
    sessions = raw.get("sessions") if isinstance(raw, dict) else raw
    if not isinstance(sessions, list):
        fail("sessions file must be a JSON array or an object with sessions[]")
    out = []
    for idx, item in enumerate(sessions):
        if not isinstance(item, dict):
            fail(f"sessions[{idx}] must be an object")
        for key in ["agent", "session_key", "jsonl_path"]:
            if not isinstance(item.get(key), str) or not item[key].strip():
                fail(f"sessions[{idx}].{key} is required")
        out.append(item)
    return out


def active_sessions(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        s for s in manifest.get("sessions", [])
        if s.get("status") not in {"skipped_no_new_turns"}
    ]


def all_new_ids(manifest: dict[str, Any]) -> list[str]:
    ids = []
    for session in manifest.get("sessions", []):
        ids.extend(session.get("new_ids") or [])
    return ids


def summarize_sessions(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for session in manifest.get("sessions", []):
        rows.append({
            "session_key": session.get("session_key"),
            "status": session.get("status"),
            "new_turns_count": session.get("new_turns_count"),
            "extraction_count": session.get("extraction_count"),
            "final_count": session.get("final_count"),
            "new_ids": session.get("new_ids", []),
        })
    return rows


def cmd_start_run(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    sessions = read_sessions_file(Path(args.sessions).expanduser().resolve())
    run_dir = (
        Path(args.run_dir).expanduser().resolve()
        if args.run_dir
        else Path("/tmp") / f"distill_run_{utc_stamp()}"
    )
    run_dir.mkdir(parents=True, exist_ok=True)

    run_helper("init", "--knowledge-dir", str(knowledge_dir))

    manifest = {
        "version": 1,
        "run_id": run_dir.name,
        "created_at": utc_now_iso(),
        "updated_at": utc_now_iso(),
        "knowledge_dir": str(knowledge_dir),
        "run_dir": str(run_dir),
        "sessions": [],
        "fusion": {
            "input_path": str(run_dir / "fusion" / "input.json"),
            "output_path": str(run_dir / "fusion" / "output.json"),
            "needed": False,
            "applied": False,
        },
        "merge": {
            "candidates": [],
            "new_pending_ids": [],
            "pending_links_input_path": str(run_dir / "links" / "input.json"),
            "pending_links_output_path": str(run_dir / "links" / "output.json"),
            "links_applied": False,
            "finalized": False,
        },
        "_manifest_path": str(run_dir / "manifest.json"),
    }

    for item in sessions:
        key = item["session_key"]
        name = item.get("name") or slug(key)
        base = slug(name)
        chunk_path = run_dir / "chunks" / f"{base}.txt"
        extraction_path = run_dir / "extractions" / f"{base}.json"
        merged_path = run_dir / "merged" / f"{base}.json"

        helper_args = [
            "preprocess",
            "--agent",
            item["agent"],
            "--session-key",
            key,
            "--jsonl",
            item["jsonl_path"],
            "--knowledge-dir",
            str(knowledge_dir),
            "--threshold-bytes",
            str(args.threshold_bytes),
            "--out",
            str(chunk_path),
        ]
        if args.allow_over_threshold:
            helper_args.append("--allow-over-threshold")
        meta = run_helper(*helper_args)
        size_bytes = meta.get("chunk_size_bytes", 0)
        status = "skipped_no_new_turns" if meta.get("new_turns_count") == 0 else "ready_for_extraction"
        if meta.get("over_threshold") and not args.allow_over_threshold:
            status = "blocked_over_threshold"

        manifest["sessions"].append({
            "name": name,
            "agent": item["agent"],
            "session_key": key,
            "jsonl_path": item["jsonl_path"],
            "chunk_path": str(chunk_path),
            "extraction_path": str(extraction_path),
            "merged_extraction_path": str(merged_path),
            "last_seen_cursor": meta.get("last_seen_cursor"),
            "last_seen_uuid": meta.get("last_seen_uuid"),
            "new_turns_count": meta.get("new_turns_count"),
            "turn_range": meta.get("turn_range"),
            "chunk_size_bytes": size_bytes,
            "threshold_bytes": meta.get("threshold_bytes"),
            "over_threshold": meta.get("over_threshold"),
            "status": status,
            "new_ids": [],
        })

    save_manifest(manifest)
    emit({
        "manifest": manifest["_manifest_path"],
        "run_dir": str(run_dir),
        "sessions": summarize_sessions(manifest),
        "next": "Run extraction subagents for sessions with status=ready_for_extraction, then run prepare-fusion.",
    })


def cmd_prepare_fusion(args) -> None:
    manifest_path = manifest_path_arg(args.manifest)
    manifest = load_manifest(manifest_path)
    knowledge_dir = manifest["knowledge_dir"]
    fusion_input: dict[str, Any] = {}
    total = 0

    for session in active_sessions(manifest):
        extraction_path = Path(session["extraction_path"])
        if not extraction_path.exists():
            fail(f"missing extraction file for {session['session_key']}: {extraction_path}")
        result = run_helper(
            "validate-extraction",
            "--extraction",
            str(extraction_path),
            "--knowledge-dir",
            knowledge_dir,
        )
        data = load_json(extraction_path)
        fusion_input[session["session_key"]] = data
        session["extraction_count"] = result["count"]
        total += result["count"]

    fusion = manifest["fusion"]
    write_json(Path(fusion["input_path"]), fusion_input)
    fusion["needed"] = total > 1
    fusion["applied"] = False
    manifest["updated_at"] = utc_now_iso()
    save_manifest(manifest)

    emit({
        "manifest": str(manifest_path),
        "fusion_input_path": fusion["input_path"],
        "fusion_output_path": fusion["output_path"],
        "total_candidates": total,
        "needs_llm": fusion["needed"],
        "next": "If needs_llm=true, run batch fusion and write fusion_output_path; then run apply-fusion.",
    })


def cmd_apply_fusion(args) -> None:
    manifest_path = manifest_path_arg(args.manifest)
    manifest = load_manifest(manifest_path)
    knowledge_dir = manifest["knowledge_dir"]
    fusion = manifest["fusion"]

    if fusion.get("needed"):
        output_path = Path(args.fusion_output or fusion["output_path"]).expanduser().resolve()
        if not output_path.exists():
            fail(f"missing fusion output: {output_path}")
        grouped = load_json(output_path)
        if not isinstance(grouped, dict):
            fail("fusion output must be an object keyed by session_key")
        fusion["output_path"] = str(output_path)
    else:
        grouped = None

    for session in active_sessions(manifest):
        merged_path = Path(session["merged_extraction_path"])
        merged_path.parent.mkdir(parents=True, exist_ok=True)
        if grouped is None:
            shutil.copyfile(session["extraction_path"], merged_path)
        else:
            if session["session_key"] not in grouped:
                fail(f"fusion output missing session_key: {session['session_key']}")
            write_json(merged_path, grouped[session["session_key"]])
        result = run_helper(
            "validate-extraction",
            "--extraction",
            str(merged_path),
            "--knowledge-dir",
            knowledge_dir,
        )
        session["final_count"] = result["count"]
        session["status"] = "ready_for_capture"

    fusion["applied"] = True
    manifest["updated_at"] = utc_now_iso()
    save_manifest(manifest)
    emit({
        "manifest": str(manifest_path),
        "sessions": summarize_sessions(manifest),
        "next": "Run capture.",
    })


def cmd_capture(args) -> None:
    manifest_path = manifest_path_arg(args.manifest)
    manifest = load_manifest(manifest_path)
    knowledge_dir = manifest["knowledge_dir"]

    for session in active_sessions(manifest):
        if session.get("status") not in {"ready_for_capture", "captured"}:
            fail(f"session not ready for capture: {session['session_key']}")
        if session.get("status") == "captured":
            continue
        merged_path = Path(session["merged_extraction_path"])
        result = run_helper(
            "capture",
            "--extraction",
            str(merged_path),
            "--session-id",
            session["session_key"],
            "--knowledge-dir",
            knowledge_dir,
        )
        session["new_ids"] = result["new_ids"]
        session["capture_skipped"] = result.get("skipped", [])
        session["status"] = "captured"

    manifest["updated_at"] = utc_now_iso()
    save_manifest(manifest)
    emit({
        "manifest": str(manifest_path),
        "new_ids": all_new_ids(manifest),
        "sessions": summarize_sessions(manifest),
        "next": "Run prepare-merge.",
    })


def cmd_prepare_merge(args) -> None:
    manifest_path = manifest_path_arg(args.manifest)
    manifest = load_manifest(manifest_path)
    knowledge_dir = manifest["knowledge_dir"]
    run_dir = Path(manifest["run_dir"])
    candidates = []

    for pid in all_new_ids(manifest):
        candidate = run_helper(
            "get-stage1-candidate",
            "--candidate-id",
            pid,
            "--knowledge-dir",
            knowledge_dir,
        )
        domain = candidate.get("domain")
        canonical_index = run_helper(
            "dump-canonical-index",
            "--domain",
            domain,
            "--knowledge-dir",
            knowledge_dir,
        )
        candidate_path = run_dir / "merge" / "candidates" / f"{pid}.json"
        canonical_path = run_dir / "merge" / "canonical" / f"{pid}.json"
        judgment_path = run_dir / "merge" / "judgments" / f"{pid}.json"
        task_path = run_dir / "merge" / "tasks" / f"{pid}.json"
        write_json(candidate_path, candidate)
        write_json(canonical_path, canonical_index)

        needs_llm = bool(canonical_index)
        if not needs_llm:
            write_json(judgment_path, NONE_JUDGMENT)
        else:
            write_json(task_path, {
                "candidate": candidate,
                "canonical_index": canonical_index,
                "judgment_output_path": str(judgment_path),
            })

        candidates.append({
            "id": pid,
            "domain": domain,
            "candidate_path": str(candidate_path),
            "canonical_index_path": str(canonical_path),
            "task_path": str(task_path) if needs_llm else None,
            "judgment_path": str(judgment_path),
            "needs_llm": needs_llm,
        })

    manifest["merge"]["candidates"] = candidates
    manifest["merge"]["finalized"] = False
    manifest["updated_at"] = utc_now_iso()
    save_manifest(manifest)
    emit({
        "manifest": str(manifest_path),
        "candidate_count": len(candidates),
        "needs_llm": [c["id"] for c in candidates if c["needs_llm"]],
        "auto_none": [c["id"] for c in candidates if not c["needs_llm"]],
        "next": "Write judgment files for needs_llm candidates, then run finalize.",
    })


def cmd_finalize(args) -> None:
    manifest_path = manifest_path_arg(args.manifest)
    manifest = load_manifest(manifest_path)
    knowledge_dir = manifest["knowledge_dir"]
    new_pending_ids = []
    distribution: dict[str, int] = {}

    for item in manifest["merge"].get("candidates", []):
        judgment_path = Path(item["judgment_path"])
        if not judgment_path.exists():
            fail(f"missing judgment file for {item['id']}: {judgment_path}")
        run_helper("validate-judgment", "--judgment", str(judgment_path))
        judgment = load_json(judgment_path)
        result = run_helper(
            "finalize",
            "--candidate-id",
            item["id"],
            "--judgment",
            str(judgment_path),
            "--knowledge-dir",
            knowledge_dir,
        )
        item["finalized"] = True
        item["m1_judgment"] = result["judgment"]
        distribution[result["judgment"]] = distribution.get(result["judgment"], 0) + 1
        if judgment["m1_judgment"] != "duplicate":
            new_pending_ids.append(item["id"])

    manifest["merge"]["new_pending_ids"] = new_pending_ids
    manifest["merge"]["judgment_distribution"] = distribution
    manifest["merge"]["finalized"] = True
    manifest["updated_at"] = utc_now_iso()
    save_manifest(manifest)
    emit({
        "manifest": str(manifest_path),
        "new_pending_ids": new_pending_ids,
        "judgment_distribution": distribution,
        "next": "Run prepare-links.",
    })


def short_pending(body: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": body.get("id"),
        "form": body.get("form"),
        "domain": body.get("domain"),
        "title": body.get("title"),
        "abstract": body.get("abstract"),
    }


def cmd_prepare_links(args) -> None:
    manifest_path = manifest_path_arg(args.manifest)
    manifest = load_manifest(manifest_path)
    knowledge_dir = manifest["knowledge_dir"]
    new_pending_ids = manifest["merge"].get("new_pending_ids", [])
    link_tasks = []

    for pid in new_pending_ids:
        source = run_helper(
            "get-candidate",
            "--candidate-id",
            pid,
            "--knowledge-dir",
            knowledge_dir,
        )
        domain = source.get("domain")
        canonical_index = run_helper(
            "dump-canonical-index",
            "--domain",
            domain,
            "--knowledge-dir",
            knowledge_dir,
        )
        pending_index = run_helper(
            "dump-pending-index",
            "--ids",
            ",".join(new_pending_ids),
            "--domain",
            domain,
            "--knowledge-dir",
            knowledge_dir,
        )
        pending_index = [row for row in pending_index if row.get("id") != pid]
        link_tasks.append({
            "source": short_pending(source),
            "canonical_index": canonical_index,
            "pending_index": pending_index,
        })

    links_input_path = Path(manifest["merge"]["pending_links_input_path"])
    links_output_path = Path(manifest["merge"]["pending_links_output_path"])
    needs_llm = any(task["canonical_index"] or task["pending_index"] for task in link_tasks)
    write_json(links_input_path, link_tasks)
    if not needs_llm:
        write_json(links_output_path, [])
    manifest["merge"]["links_prepared"] = True
    manifest["merge"]["links_applied"] = False
    manifest["updated_at"] = utc_now_iso()
    save_manifest(manifest)

    emit({
        "manifest": str(manifest_path),
        "links_input_path": str(links_input_path),
        "links_output_path": str(links_output_path),
        "source_count": len(link_tasks),
        "needs_llm": needs_llm,
        "next": "Run pending link pass if needs_llm=true, then run finish.",
    })


def cmd_finish(args) -> None:
    manifest_path = manifest_path_arg(args.manifest)
    manifest = load_manifest(manifest_path)
    knowledge_dir = manifest["knowledge_dir"]
    new_pending_ids = manifest["merge"].get("new_pending_ids", [])

    applied_links = None
    if new_pending_ids:
        links_path = Path(args.links or manifest["merge"]["pending_links_output_path"]).expanduser().resolve()
        if not links_path.exists():
            fail(f"missing pending links file: {links_path}")
        run_helper("validate-pending-links", "--links", str(links_path), "--knowledge-dir", knowledge_dir)
        applied_links = run_helper(
            "apply-pending-links",
            "--links",
            str(links_path),
            "--knowledge-dir",
            knowledge_dir,
        )
        manifest["merge"]["pending_links_output_path"] = str(links_path)
        manifest["merge"]["links_applied"] = True

    committed = []
    for session in manifest.get("sessions", []):
        if session.get("status") == "skipped_no_new_turns":
            continue
        position = session.get("last_seen_cursor")
        if not position:
            continue
        result = run_helper(
            "commit-cursor",
            "--session-id",
            session["session_key"],
            "--position",
            position,
            "--agent",
            session["agent"],
            "--knowledge-dir",
            knowledge_dir,
        )
        committed.append(result["session_id"])
        session["status"] = "complete"

    manifest["completed_at"] = utc_now_iso()
    manifest["updated_at"] = manifest["completed_at"]
    save_manifest(manifest)
    emit({
        "manifest": str(manifest_path),
        "committed_sessions": committed,
        "applied_links": applied_links,
        "stage1_remaining": run_helper("list-stage1", "--knowledge-dir", knowledge_dir),
        "status": "complete",
    })


def cmd_status(args) -> None:
    manifest_path = manifest_path_arg(args.manifest)
    manifest = load_manifest(manifest_path)
    emit({
        "manifest": str(manifest_path),
        "run_id": manifest.get("run_id"),
        "created_at": manifest.get("created_at"),
        "updated_at": manifest.get("updated_at"),
        "sessions": summarize_sessions(manifest),
        "new_ids": all_new_ids(manifest),
        "new_pending_ids": manifest.get("merge", {}).get("new_pending_ids", []),
        "fusion": manifest.get("fusion"),
        "merge": {
            "candidate_count": len(manifest.get("merge", {}).get("candidates", [])),
            "finalized": manifest.get("merge", {}).get("finalized"),
            "links_applied": manifest.get("merge", {}).get("links_applied"),
        },
    })


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("start-run", help="preprocess selected sessions and create a manifest")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--sessions", required=True, help="JSON array or object with sessions[]")
    p.add_argument("--run-dir")
    p.add_argument("--threshold-bytes", type=int, default=600_000)
    p.add_argument("--allow-over-threshold", action="store_true")
    p.set_defaults(func=cmd_start_run)

    p = sub.add_parser("prepare-fusion", help="validate extraction files and write fusion input")
    p.add_argument("--manifest", required=True)
    p.set_defaults(func=cmd_prepare_fusion)

    p = sub.add_parser("apply-fusion", help="split/validate fusion output or pass through raw extractions")
    p.add_argument("--manifest", required=True)
    p.add_argument("--fusion-output")
    p.set_defaults(func=cmd_apply_fusion)

    p = sub.add_parser("capture", help="capture final extraction files into stage1")
    p.add_argument("--manifest", required=True)
    p.set_defaults(func=cmd_capture)

    p = sub.add_parser("prepare-merge", help="write merge task inputs and auto-none judgments")
    p.add_argument("--manifest", required=True)
    p.set_defaults(func=cmd_prepare_merge)

    p = sub.add_parser("finalize", help="validate judgments and finalize stage1 candidates")
    p.add_argument("--manifest", required=True)
    p.set_defaults(func=cmd_finalize)

    p = sub.add_parser("prepare-links", help="write pending link pass input")
    p.add_argument("--manifest", required=True)
    p.set_defaults(func=cmd_prepare_links)

    p = sub.add_parser("finish", help="apply pending links and commit session cursors")
    p.add_argument("--manifest", required=True)
    p.add_argument("--links")
    p.set_defaults(func=cmd_finish)

    p = sub.add_parser("status", help="print manifest status")
    p.add_argument("--manifest", required=True)
    p.set_defaults(func=cmd_status)
    return ap


def main() -> None:
    args = build_parser().parse_args()
    try:
        args.func(args)
    except RuntimeError as exc:
        fail(str(exc))


if __name__ == "__main__":
    main()
