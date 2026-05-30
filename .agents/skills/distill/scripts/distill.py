#!/usr/bin/env python3
"""distill v1 deterministic helpers shared by distill and merge.

The skill around this script is LLM-assisted, but this file stays deterministic:
discover local agent sessions, filter display text, validate LLM JSON, write
stage1/pending/duplicates, expose lookup helpers, and advance the session cursor.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ALLOWED_FORMS = {"practice", "methodology", "theory"}
ALLOWED_JUDGMENTS = {"duplicate", "update", "link", "none"}
ALLOWED_SUGGESTED_RELATIONS = {"update", "link"}
ALLOWED_LINK_TARGETS = {"canonical", "pending"}
ALLOWED_ATTRIBUTION_KINDS = {
    "user_position",
    "assistant_explanation",
    "external_material",
    "tool_observation",
}
ALLOWED_CLAIM_OWNERS = {"user", "assistant", "source", "tool"}
ALLOWED_ADOPTIONS = {"explicitly_adopted", "discussed", "unendorsed", "observed"}
AGENTS = {"claudecode", "codex"}
SESSION_KINDS = {"main", "subagent", "exec", "unknown", "all"}


class ValidationError(Exception):
    pass


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path: Path, default: Any) -> Any:
    if path.exists() and path.stat().st_size > 0:
        return json.loads(path.read_text())
    return default


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def emit(obj: Any) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def fail(message: str) -> None:
    sys.exit(f"ERROR: {message}")


def require_dict(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValidationError(f"{label} must be an object")
    return value


def require_str(value: Any, label: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise ValidationError(f"{label} must be a string")
    if not allow_empty and not value.strip():
        raise ValidationError(f"{label} must be non-empty")
    return value


def nullable_str(value: Any, label: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError(f"{label} must be a string or null")
    return value.strip() or None


def load_domains(knowledge_dir: Path) -> set[str]:
    """Parse the small whitelist.yaml format used by this skill.

    The supported shape is intentionally tiny:
      domains:
        - blockchain
        - ai
    """
    path = knowledge_dir / "whitelist.yaml"
    if not path.exists():
        return set()
    domains: set[str] = set()
    in_domains = False
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line == "domains:":
            in_domains = True
            continue
        if in_domains and line.startswith("- "):
            item = line[2:].strip()
            if item:
                domains.add(item)
            continue
        if in_domains and not raw.startswith((" ", "\t", "-")):
            in_domains = False
    return domains


def ensure_knowledge_layout(knowledge_dir: Path) -> None:
    (knowledge_dir / "canonical").mkdir(parents=True, exist_ok=True)
    for name, default in {
        "distill_stage1.json": {},
        "pending.json": {},
        "duplicates.json": {},
        "rejected.json": {},
        "history.json": {"last_run_at": None, "sessions": {}},
    }.items():
        path = knowledge_dir / name
        if not path.exists():
            write_json(path, default)


def all_canonical(knowledge_dir: Path) -> dict[str, dict[str, Any]]:
    canonical_dir = knowledge_dir / "canonical"
    out: dict[str, dict[str, Any]] = {}
    if not canonical_dir.is_dir():
        return out
    for jp in sorted(canonical_dir.glob("*.json")):
        data = load_json(jp, {})
        if not isinstance(data, dict):
            continue
        for cid, body in data.items():
            if isinstance(body, dict):
                out[str(cid)] = body
    return out


def find_canonical(knowledge_dir: Path, cid: str) -> dict[str, Any] | None:
    return all_canonical(knowledge_dir).get(cid)


def source_signature(session_id: str, turn_range: Any, evidence_quote: Any) -> tuple[Any, Any, Any]:
    turn_key = tuple(turn_range) if isinstance(turn_range, list) else turn_range
    evidence_key = evidence_quote.strip() if isinstance(evidence_quote, str) else evidence_quote
    return session_id, turn_key, evidence_key


def existing_candidate_signatures(knowledge_dir: Path) -> set[tuple[Any, Any, Any]]:
    signatures: set[tuple[Any, Any, Any]] = set()
    for name in ["distill_stage1.json", "pending.json", "duplicates.json", "rejected.json"]:
        data = load_json(knowledge_dir / name, {})
        if not isinstance(data, dict):
            continue
        for body in data.values():
            if not isinstance(body, dict):
                continue
            source = body.get("source") or {}
            signatures.add(
                source_signature(
                    str(source.get("session_id")),
                    source.get("turn_range"),
                    source.get("evidence_quote"),
                )
            )
    return signatures


def existing_candidate_ids(knowledge_dir: Path) -> set[str]:
    ids: set[str] = set()
    for name in ["distill_stage1.json", "pending.json", "duplicates.json", "rejected.json"]:
        data = load_json(knowledge_dir / name, {})
        if isinstance(data, dict):
            ids.update(str(k) for k in data.keys())
    return ids


# ---------- agent session discovery and jsonl filtering ----------


def default_agent_roots() -> dict[str, Path]:
    home = Path.home()
    return {
        "claudecode": home / ".claude" / "projects",
        "codex": home / ".codex" / "sessions",
    }


def infer_agent(jsonl_path: Path) -> str:
    parts = set(jsonl_path.expanduser().resolve().parts)
    if ".codex" in parts:
        return "codex"
    if ".claude" in parts:
        return "claudecode"
    return "claudecode"


def session_key(agent: str, jsonl_path: Path) -> str:
    return f"{agent}:{jsonl_path.stem}"


def path_contains_part(path: Path, part: str) -> bool:
    return part in path.expanduser().resolve().parts


def source_has_subagent(source: Any) -> bool:
    return isinstance(source, dict) and isinstance(source.get("subagent"), dict)


def classify_session_kind(agent: str, jsonl_path: Path, meta: dict[str, Any]) -> str:
    if agent == "claudecode":
        if path_contains_part(jsonl_path, "subagents") or meta.get("is_sidechain") is True:
            return "subagent"
        return "main"

    if agent == "codex":
        source = meta.get("source")
        if meta.get("thread_source") == "subagent" or source_has_subagent(source):
            return "subagent"
        if meta.get("originator") == "codex_exec" or source == "exec":
            return "exec"
        # Older Codex JSONL may not include session_meta. Treat it as main
        # unless it carries an explicit subagent or exec signal.
        return "main"

    return "unknown"


def cursor_entry(cursor: dict[str, Any], key: str, legacy_key: str) -> dict[str, Any]:
    sessions = cursor.get("sessions") or {}
    entry = sessions.get(key) or sessions.get(legacy_key) or {}
    return entry if isinstance(entry, dict) else {}


def cursor_value(entry: dict[str, Any]) -> str | None:
    value = (
        entry.get("last_processed_cursor")
        or entry.get("last_processed_uuid")
        or entry.get("last_processed_position")
    )
    return str(value) if value else None


def parse_line_cursor(value: str | None) -> int | None:
    if not value or not value.startswith("line:"):
        return None
    try:
        return int(value.split(":", 1)[1])
    except ValueError:
        return None


def normalize_text_blocks(content: Any, text_types: set[str]) -> str | None:
    if isinstance(content, str):
        text = content.strip()
        return text or None
    if not isinstance(content, list):
        return None
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") in text_types:
            text = (block.get("text") or "").strip()
            if text:
                parts.append(text)
    return "\n\n".join(parts) if parts else None


def extract_claudecode_text(turn: dict[str, Any]) -> tuple[str | None, str | None]:
    t = turn.get("type")
    msg = turn.get("message") or {}
    content = msg.get("content")

    if t == "user" and isinstance(content, str):
        text = content.strip()
        return ("user", text) if text else (None, None)

    if t == "assistant" and isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = (block.get("text") or "").strip()
                if text:
                    parts.append(text)
        return ("assistant", "\n\n".join(parts)) if parts else (None, None)

    return None, None


def extract_codex_text(turn: dict[str, Any]) -> tuple[str | None, str | None]:
    if turn.get("type") != "response_item":
        return None, None
    payload = turn.get("payload") or {}
    if payload.get("type") != "message":
        return None, None
    role = payload.get("role")
    if role not in {"user", "assistant"}:
        return None, None
    text_types = {"input_text"} if role == "user" else {"output_text"}
    text = normalize_text_blocks(payload.get("content"), text_types)
    return (role, text) if text else (None, None)


def extract_displayable_text(
    turn: dict[str, Any], agent: str = "claudecode"
) -> tuple[str | None, str | None]:
    """Return (speaker, text), or (None, None) for non-displayable turns."""
    if agent == "codex":
        return extract_codex_text(turn)
    return extract_claudecode_text(turn)


def iter_jsonl(jsonl_path: Path):
    with jsonl_path.open() as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                yield i, json.loads(line)
            except json.JSONDecodeError:
                continue


def session_metadata(agent: str, jsonl_path: Path) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    for _, row in iter_jsonl(jsonl_path):
        if agent == "codex" and row.get("type") == "session_meta":
            payload = row.get("payload") or {}
            meta["session_id"] = payload.get("id")
            meta["cwd"] = payload.get("cwd")
            meta["created_at"] = payload.get("timestamp") or row.get("timestamp")
            meta["originator"] = payload.get("originator")
            meta["source"] = payload.get("source")
            meta["thread_source"] = payload.get("thread_source")
            break
        if agent == "claudecode":
            if row.get("sessionId"):
                meta["session_id"] = row.get("sessionId")
            if row.get("cwd"):
                meta["cwd"] = row.get("cwd")
            if row.get("timestamp"):
                meta["created_at"] = row.get("timestamp")
            if "isSidechain" in row:
                meta["is_sidechain"] = row.get("isSidechain")
            if meta:
                break
    meta["session_kind"] = classify_session_kind(agent, jsonl_path, meta)
    return meta


def preprocess_session(
    jsonl_path: Path,
    knowledge_dir: Path,
    *,
    agent: str,
    key: str | None = None,
    allow_non_main: bool = False,
) -> tuple[dict[str, Any], str]:
    ensure_knowledge_layout(knowledge_dir)
    if not jsonl_path.is_file():
        fail(f"jsonl not found: {jsonl_path}")

    info = session_metadata(agent, jsonl_path)
    session_kind = info.get("session_kind", "unknown")
    if session_kind != "main" and not allow_non_main:
        fail(
            f"{agent} session {jsonl_path} is {session_kind}; "
            "distill only processes main sessions by default"
        )

    cursor = load_json(knowledge_dir / "history.json", {"sessions": {}, "last_run_at": None})
    key = key or session_key(agent, jsonl_path)
    legacy_key = jsonl_path.stem
    entry = cursor_entry(cursor, key, legacy_key)
    last_cursor = cursor_value(entry)
    last_line = parse_line_cursor(last_cursor)

    started = last_cursor is None or last_line is not None
    kept_lines: list[str] = []
    kept_turn_idxs: list[int] = []
    last_seen_uuid = None
    last_seen_cursor = None

    for idx, turn in iter_jsonl(jsonl_path):
        if agent == "codex":
            last_seen_cursor = f"line:{idx}"
            if last_line is not None and idx <= last_line:
                continue
        else:
            uuid = turn.get("uuid")
            if uuid:
                last_seen_uuid = uuid
                last_seen_cursor = uuid
            if not started:
                if uuid == last_cursor:
                    started = True
                continue

        speaker, text = extract_displayable_text(turn, agent)
        if speaker is None:
            continue

        kept_lines.append(f"[turn {idx}] {speaker}:\n{text}\n")
        kept_turn_idxs.append(idx)

    chunk_text = "\n".join(kept_lines)
    meta = {
        "agent": agent,
        "session_key": key,
        "session_id": info.get("session_id") or legacy_key,
        "session_kind": session_kind,
        "jsonl_path": str(jsonl_path),
        "last_processed_cursor_before": last_cursor,
        "last_processed_uuid_before": last_cursor if agent == "claudecode" else None,
        "last_seen_cursor": last_seen_cursor,
        "last_seen_uuid": last_seen_uuid,
        "new_turns_count": len(kept_turn_idxs),
        "turn_range": [kept_turn_idxs[0], kept_turn_idxs[-1]] if kept_turn_idxs else None,
    }
    return meta, chunk_text


def discover_agent_sessions(
    *,
    agent: str,
    root: Path,
    knowledge_dir: Path,
    limit: int,
    session_kind: str,
) -> list[dict[str, Any]]:
    ensure_knowledge_layout(knowledge_dir)
    if not root.exists():
        return []
    paths = sorted(root.rglob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    rows: list[dict[str, Any]] = []
    for jp in paths:
        key = session_key(agent, jp)
        info = session_metadata(agent, jp)
        kind = info.get("session_kind", "unknown")
        if session_kind != "all" and kind != session_kind:
            continue
        meta, chunk = preprocess_session(
            jp,
            knowledge_dir,
            agent=agent,
            key=key,
            allow_non_main=session_kind == "all",
        )
        stat = jp.stat()
        preview = " ".join(chunk.split())
        project = info.get("cwd") or (
            str(jp.parent.relative_to(root)) if jp.parent != root else "."
        )
        rows.append({
            "agent": agent,
            "session_key": key,
            "session_id": info.get("session_id") or jp.stem,
            "session_kind": kind,
            "project": project,
            "jsonl_path": str(jp),
            "updated_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            ),
            "size_bytes": stat.st_size,
            "last_captured_at": (
                cursor_entry(
                    load_json(knowledge_dir / "history.json", {"sessions": {}}),
                    key,
                    jp.stem,
                ).get("processed_at")
            ),
            "last_processed_cursor": meta["last_processed_cursor_before"],
            "new_turns_count": meta["new_turns_count"],
            "new_preview": preview[:160],
        })
        if len(rows) >= limit:
            break
    return rows


def markdown_escape(value: Any) -> str:
    text = "" if value is None else str(value)
    return text.replace("|", "\\|").replace("\n", " ")


def rows_to_markdown(rows: list[dict[str, Any]]) -> str:
    headers = ["行", "Agent", "类型", "项目/目录", "会话", "更新", "上次抓取", "新增轮次", "新增预览"]
    lines = [
        "| " + " | ".join(headers) + " |",
        "|---:|---|---|---|---|---|---:|---|",
    ]
    for i, row in enumerate(rows, start=1):
        row["row_id"] = i
        cells = [
            i,
            row["agent"],
            row.get("session_kind", "unknown"),
            row["project"],
            row["session_key"],
            row["updated_at"],
            row["last_captured_at"] or "未抓取",
            row["new_turns_count"],
            row["new_preview"],
        ]
        lines.append("| " + " | ".join(markdown_escape(c) for c in cells) + " |")
    return "\n".join(lines) + "\n"


# ---------- validation ----------


def validate_turn_range(value: Any, label: str) -> list[int]:
    if (
        not isinstance(value, list)
        or len(value) != 2
        or not all(isinstance(x, int) for x in value)
        or value[0] > value[1]
    ):
        raise ValidationError(f"{label} must be [start_int, end_int] with start <= end")
    return value


def validate_attribution(value: Any, label: str) -> dict[str, str]:
    body = require_dict(value, label)
    kind = require_str(body.get("kind"), f"{label}.kind")
    if kind not in ALLOWED_ATTRIBUTION_KINDS:
        raise ValidationError(
            f"{label}.kind must be one of {sorted(ALLOWED_ATTRIBUTION_KINDS)}"
        )
    claim_owner = require_str(body.get("claim_owner"), f"{label}.claim_owner")
    if claim_owner not in ALLOWED_CLAIM_OWNERS:
        raise ValidationError(
            f"{label}.claim_owner must be one of {sorted(ALLOWED_CLAIM_OWNERS)}"
        )
    adoption = require_str(body.get("adoption"), f"{label}.adoption")
    if adoption not in ALLOWED_ADOPTIONS:
        raise ValidationError(
            f"{label}.adoption must be one of {sorted(ALLOWED_ADOPTIONS)}"
        )

    expected_owner = {
        "user_position": "user",
        "assistant_explanation": "assistant",
        "external_material": "source",
        "tool_observation": "tool",
    }[kind]
    if claim_owner != expected_owner:
        raise ValidationError(
            f"{label}.claim_owner must be {expected_owner!r} when kind is {kind!r}"
        )

    if kind == "user_position" and adoption == "unendorsed":
        raise ValidationError(f"{label}.adoption cannot be unendorsed for user_position")
    if kind == "tool_observation" and adoption != "observed":
        raise ValidationError(f"{label}.adoption must be observed for tool_observation")
    if kind == "assistant_explanation" and adoption == "observed":
        raise ValidationError(f"{label}.adoption cannot be observed for assistant_explanation")
    if kind == "external_material" and adoption == "observed":
        raise ValidationError(f"{label}.adoption cannot be observed for external_material")

    return {"kind": kind, "claim_owner": claim_owner, "adoption": adoption}


def validate_extraction_item(item: Any, idx: int, domains: set[str]) -> dict[str, Any]:
    body = require_dict(item, f"extraction[{idx}]")
    form = require_str(body.get("form"), f"extraction[{idx}].form")
    if form not in ALLOWED_FORMS:
        raise ValidationError(f"extraction[{idx}].form must be one of {sorted(ALLOWED_FORMS)}")

    domain = require_str(body.get("domain"), f"extraction[{idx}].domain")
    if domain != "_unknown" and domains and domain not in domains:
        raise ValidationError(
            f"extraction[{idx}].domain {domain!r} not in whitelist and not _unknown"
        )

    title = require_str(body.get("title"), f"extraction[{idx}].title")
    abstract = require_str(body.get("abstract"), f"extraction[{idx}].abstract")
    agent = nullable_str(body.get("agent"), f"extraction[{idx}].agent")
    human = nullable_str(body.get("human"), f"extraction[{idx}].human")
    attribution = validate_attribution(
        body.get("attribution"), f"extraction[{idx}].attribution"
    )
    evidence_quote = require_str(body.get("evidence_quote"), f"extraction[{idx}].evidence_quote")
    turn_range = validate_turn_range(body.get("turn_range"), f"extraction[{idx}].turn_range")

    if form == "practice" and not agent:
        raise ValidationError(f"extraction[{idx}].agent is required for practice")
    if form == "methodology" and (not agent or not human):
        raise ValidationError(f"extraction[{idx}] methodology requires agent and human")
    if form == "theory" and not human:
        raise ValidationError(f"extraction[{idx}].human is required for theory")

    return {
        "form": form,
        "domain": domain,
        "title": title.strip(),
        "abstract": abstract.strip(),
        "agent": agent,
        "human": human,
        "attribution": attribution,
        "evidence_quote": evidence_quote.strip(),
        "turn_range": turn_range,
    }


def validate_extraction_array(value: Any, domains: set[str]) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise ValidationError("extraction file must contain a JSON array")
    return [validate_extraction_item(item, idx, domains) for idx, item in enumerate(value)]


def validate_neighbor(value: Any, idx: int) -> dict[str, Any]:
    body = require_dict(value, f"m1_neighbors[{idx}]")
    nid = require_str(body.get("id"), f"m1_neighbors[{idx}].id")
    sim = body.get("sim")
    if not isinstance(sim, (int, float)):
        raise ValidationError(f"m1_neighbors[{idx}].sim must be a number")
    relation = require_str(
        body.get("suggested_relation"), f"m1_neighbors[{idx}].suggested_relation"
    )
    if relation not in ALLOWED_SUGGESTED_RELATIONS:
        raise ValidationError(
            f"m1_neighbors[{idx}].suggested_relation must be update or link"
        )
    return {"id": nid, "sim": float(sim), "suggested_relation": relation}


def validate_judgment_object(value: Any) -> dict[str, Any]:
    body = require_dict(value, "judgment")
    judgment = require_str(body.get("m1_judgment"), "m1_judgment")
    if judgment not in ALLOWED_JUDGMENTS:
        raise ValidationError(f"m1_judgment must be one of {sorted(ALLOWED_JUDGMENTS)}")

    neighbors_raw = body.get("m1_neighbors", [])
    if not isinstance(neighbors_raw, list):
        raise ValidationError("m1_neighbors must be an array")
    neighbors = [validate_neighbor(nb, idx) for idx, nb in enumerate(neighbors_raw)]

    merge_preview = nullable_str(body.get("m1_merge_preview"), "m1_merge_preview")
    matched = nullable_str(body.get("matched_canonical_id"), "matched_canonical_id")

    if judgment == "duplicate":
        if not matched:
            raise ValidationError("duplicate requires matched_canonical_id")
        if merge_preview is not None:
            raise ValidationError("duplicate requires m1_merge_preview = null")
    elif judgment == "update":
        if not neighbors:
            raise ValidationError("update requires at least one m1_neighbor")
        if not merge_preview:
            raise ValidationError("update requires non-empty m1_merge_preview")
        if matched is not None:
            raise ValidationError("update requires matched_canonical_id = null")
    elif judgment == "link":
        if not neighbors:
            raise ValidationError("link requires at least one m1_neighbor")
        if merge_preview is not None:
            raise ValidationError("link requires m1_merge_preview = null")
        if matched is not None:
            raise ValidationError("link requires matched_canonical_id = null")
    elif judgment == "none":
        if neighbors:
            raise ValidationError("none requires empty m1_neighbors")
        if merge_preview is not None:
            raise ValidationError("none requires m1_merge_preview = null")
        if matched is not None:
            raise ValidationError("none requires matched_canonical_id = null")

    return {
        "m1_judgment": judgment,
        "m1_neighbors": neighbors,
        "m1_merge_preview": merge_preview,
        "matched_canonical_id": matched,
    }


# ---------- commands ----------


def cmd_init(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    ensure_knowledge_layout(knowledge_dir)
    whitelist = knowledge_dir / "whitelist.yaml"
    if not whitelist.exists():
        whitelist.write_text(
            "domains:\n"
            "  - blockchain\n"
            "  - ai\n"
            "  - writing\n"
            "  - system\n"
            "  - life\n"
        )
    emit({"knowledge_dir": str(knowledge_dir), "initialized": True})


def cmd_list_sessions(args) -> None:
    project_dir = Path(args.project_dir).expanduser().resolve()
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    ensure_knowledge_layout(knowledge_dir)
    cursor = load_json(knowledge_dir / "history.json", {"sessions": {}})
    sessions = cursor.get("sessions", {})

    rows = []
    for jp in sorted(project_dir.glob("*.jsonl")):
        sid = jp.stem
        rows.append({
            "session_id": sid,
            "jsonl_path": str(jp),
            "size_bytes": jp.stat().st_size,
            "last_processed_uuid": sessions.get(sid, {}).get("last_processed_uuid"),
        })
    emit(rows)


def cmd_list_agent_sessions(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    if args.session_kind not in SESSION_KINDS:
        fail(f"session-kind must be one of {sorted(SESSION_KINDS)}")
    selected = sorted(AGENTS) if args.agent == "all" else [args.agent]
    roots = {
        "claudecode": Path(args.claudecode_root).expanduser().resolve(),
        "codex": Path(args.codex_root).expanduser().resolve(),
    }

    rows: list[dict[str, Any]] = []
    per_agent_limit = max(args.limit, 1)
    for agent_name in selected:
        rows.extend(discover_agent_sessions(
            agent=agent_name,
            root=roots[agent_name],
            knowledge_dir=knowledge_dir,
            limit=per_agent_limit,
            session_kind=args.session_kind,
        ))
    rows = sorted(rows, key=lambda r: r["updated_at"], reverse=True)[: args.limit]
    for i, row in enumerate(rows, start=1):
        row["row_id"] = i

    if args.format == "markdown":
        sys.stdout.write(rows_to_markdown(rows))
    else:
        emit(rows)


def cmd_preprocess(args) -> None:
    jsonl_path = Path(args.jsonl).expanduser().resolve()
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    agent = infer_agent(jsonl_path) if args.agent == "auto" else args.agent
    if agent not in AGENTS:
        fail(f"unknown agent: {agent}")

    meta, chunk_text = preprocess_session(
        jsonl_path,
        knowledge_dir,
        agent=agent,
        key=args.session_key,
        allow_non_main=args.allow_non_main,
    )
    size_bytes = len(chunk_text.encode("utf-8"))
    over_threshold = size_bytes > args.threshold_bytes

    meta["chunk_size_bytes"] = size_bytes
    meta["threshold_bytes"] = args.threshold_bytes
    meta["over_threshold"] = over_threshold

    if over_threshold and not args.allow_over_threshold:
        emit(meta)
        fail(
            f"chunk size {size_bytes} exceeds threshold {args.threshold_bytes}; "
            "v1 stops instead of splitting automatically"
        )

    if args.out:
        out_path = Path(args.out).expanduser().resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(chunk_text)
        meta["chunk_path"] = str(out_path)
        emit(meta)
    else:
        emit({"meta": meta, "chunk_text": chunk_text})


def cmd_validate_extraction(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    domains = load_domains(knowledge_dir)
    raw = json.loads(Path(args.extraction).expanduser().read_text())
    cleaned = validate_extraction_array(raw, domains)
    emit({"valid": True, "count": len(cleaned)})


def cmd_capture(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    ensure_knowledge_layout(knowledge_dir)
    stage1_path = knowledge_dir / "distill_stage1.json"
    domains = load_domains(knowledge_dir)

    raw = json.loads(Path(args.extraction).expanduser().read_text())
    extraction = validate_extraction_array(raw, domains)

    stage1 = load_json(stage1_path, {})
    if not isinstance(stage1, dict):
        fail("distill_stage1.json must contain an object")

    now = utc_now_iso()
    date_compact = datetime.now(timezone.utc).strftime("%Y%m%d")
    used_ids = existing_candidate_ids(knowledge_dir)
    seq = sum(1 for k in used_ids if k.startswith(f"p_{date_compact}_")) + 1
    existing = existing_candidate_signatures(knowledge_dir)

    new_ids = []
    skipped = []
    for item in extraction:
        sig = source_signature(args.session_id, item["turn_range"], item["evidence_quote"])
        if sig in existing:
            skipped.append({
                "turn_range": item["turn_range"],
                "reason": "same session_id + turn_range + evidence_quote already exists",
            })
            continue
        pid = f"p_{date_compact}_{seq:03d}"
        while pid in used_ids:
            seq += 1
            pid = f"p_{date_compact}_{seq:03d}"
        seq += 1
        stage1[pid] = {
            "id": pid,
            "source": {
                "session_id": args.session_id,
                "turn_range": item["turn_range"],
                "extracted_at": now,
                "evidence_quote": item["evidence_quote"],
            },
            "audit_status": "pending",
            "human_audited_at": None,
            "relations": [],
            "form": item["form"],
            "domain": item["domain"],
            "title": item["title"],
            "abstract": item["abstract"],
            "agent": item["agent"],
            "human": item["human"],
            "attribution": item["attribution"],
            "m1_judgment": None,
            "m1_neighbors": [],
            "m1_merge_preview": None,
            "weight": {"use_count": 0, "last_used": None},
            "temporal": {"invalid_at": None},
            "learning": {"active_recall_questions": None},
        }
        new_ids.append(pid)
        existing.add(sig)
        used_ids.add(pid)

    write_json(stage1_path, stage1)
    emit({
        "new_ids": new_ids,
        "count": len(new_ids),
        "skipped": skipped,
        "stage1_path": str(stage1_path),
    })


def cmd_dump_canonical_index(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    rows = []
    for cid, body in all_canonical(knowledge_dir).items():
        if args.domain is not None and body.get("domain") != args.domain:
            continue
        rows.append({
            "id": cid,
            "domain": body.get("domain"),
            "form": body.get("form"),
            "title": body.get("title"),
            "abstract": body.get("abstract"),
        })
    emit(rows)


def cmd_dump_pending_index(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    pending = load_json(knowledge_dir / "pending.json", {})
    if not isinstance(pending, dict):
        fail("pending.json must contain an object")

    requested = set(parse_ids(args.ids)) if args.ids else None
    rows = []
    for pid, body in sorted(pending.items()):
        if requested is not None and pid not in requested:
            continue
        if not isinstance(body, dict):
            continue
        if args.domain is not None and body.get("domain") != args.domain:
            continue
        rows.append({
            "id": pid,
            "domain": body.get("domain"),
            "form": body.get("form"),
            "title": body.get("title"),
            "abstract": body.get("abstract"),
            "m1_judgment": body.get("m1_judgment"),
        })
    emit(rows)


def cmd_list_pending(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    pending = load_json(knowledge_dir / "pending.json", {})
    if not isinstance(pending, dict):
        fail("pending.json must contain an object")
    rows = []
    for pid, body in sorted(pending.items()):
        if not isinstance(body, dict):
            continue
        if args.unclassified and body.get("m1_judgment") is not None:
            continue
        if args.session_id and (body.get("source") or {}).get("session_id") != args.session_id:
            continue
        rows.append({
            "id": pid,
            "session_id": (body.get("source") or {}).get("session_id"),
            "turn_range": (body.get("source") or {}).get("turn_range"),
            "form": body.get("form"),
            "domain": body.get("domain"),
            "title": body.get("title"),
            "m1_judgment": body.get("m1_judgment"),
        })
    emit(rows)


def cmd_list_stage1(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    ensure_knowledge_layout(knowledge_dir)
    stage1 = load_json(knowledge_dir / "distill_stage1.json", {})
    if not isinstance(stage1, dict):
        fail("distill_stage1.json must contain an object")
    rows = []
    for pid, body in sorted(stage1.items()):
        if not isinstance(body, dict):
            continue
        if args.session_id and (body.get("source") or {}).get("session_id") != args.session_id:
            continue
        rows.append({
            "id": pid,
            "session_id": (body.get("source") or {}).get("session_id"),
            "turn_range": (body.get("source") or {}).get("turn_range"),
            "form": body.get("form"),
            "domain": body.get("domain"),
            "title": body.get("title"),
            "m1_judgment": body.get("m1_judgment"),
        })
    emit(rows)


def cmd_get_candidate(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    pending = load_json(knowledge_dir / "pending.json", {})
    body = pending.get(args.candidate_id) if isinstance(pending, dict) else None
    if body is None:
        fail(f"candidate {args.candidate_id} not found in pending.json")
    emit(body)


def cmd_get_stage1_candidate(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    ensure_knowledge_layout(knowledge_dir)
    stage1 = load_json(knowledge_dir / "distill_stage1.json", {})
    body = stage1.get(args.candidate_id) if isinstance(stage1, dict) else None
    if body is None:
        fail(f"candidate {args.candidate_id} not found in distill_stage1.json")
    emit(body)


def parse_ids(ids: str) -> list[str]:
    return [x.strip() for x in ids.split(",") if x.strip()]


def cmd_get_canonical(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    canon = all_canonical(knowledge_dir)
    requested = parse_ids(args.ids)
    missing = [cid for cid in requested if cid not in canon]
    if missing:
        fail(f"canonical ids not found: {', '.join(missing)}")
    emit({cid: canon[cid] for cid in requested})


def cmd_validate_judgment(args) -> None:
    raw = json.loads(Path(args.judgment).expanduser().read_text())
    judgment = validate_judgment_object(raw)
    emit({"valid": True, "m1_judgment": judgment["m1_judgment"]})


def relation_target(rel: dict[str, Any]) -> str:
    target = rel.get("target")
    if target in ALLOWED_LINK_TARGETS:
        return str(target)
    rid = str(rel.get("id", ""))
    return "pending" if rid.startswith("p_") else "canonical"


def relation_key(rel: dict[str, Any]) -> tuple[str, str]:
    return relation_target(rel), str(rel.get("id", ""))


def validate_pending_link_item(
    value: Any,
    idx: int,
    pending: dict[str, Any],
    canonical: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    body = require_dict(value, f"pending_links[{idx}]")
    source_id = require_str(body.get("source_id"), f"pending_links[{idx}].source_id")
    target_id = require_str(
        body.get("target_id") or body.get("id"),
        f"pending_links[{idx}].target_id",
    )
    target = require_str(body.get("target"), f"pending_links[{idx}].target")
    reason = require_str(body.get("reason"), f"pending_links[{idx}].reason")

    if source_id not in pending:
        raise ValidationError(f"pending link source not found: {source_id}")
    if target not in ALLOWED_LINK_TARGETS:
        raise ValidationError(
            f"pending_links[{idx}].target must be one of {sorted(ALLOWED_LINK_TARGETS)}"
        )
    if target == "pending":
        if target_id not in pending:
            raise ValidationError(f"pending link target not found: {target_id}")
        if source_id == target_id:
            raise ValidationError("pending link cannot target itself")
    if target == "canonical" and target_id not in canonical:
        raise ValidationError(f"canonical link target not found: {target_id}")

    return {
        "source_id": source_id,
        "relation": {
            "type": "link",
            "id": target_id,
            "target": target,
            "reason": reason.strip(),
        },
    }


def validate_pending_links_array(
    value: Any,
    pending: dict[str, Any],
    canonical: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise ValidationError("pending links file must contain a JSON array")
    return [
        validate_pending_link_item(item, idx, pending, canonical)
        for idx, item in enumerate(value)
    ]


def load_pending_links(path: Path, knowledge_dir: Path) -> list[dict[str, Any]]:
    pending = load_json(knowledge_dir / "pending.json", {})
    if not isinstance(pending, dict):
        raise ValidationError("pending.json must contain an object")
    canonical = all_canonical(knowledge_dir)
    raw = json.loads(path.expanduser().read_text())
    return validate_pending_links_array(raw, pending, canonical)


def cmd_validate_pending_links(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    links = load_pending_links(Path(args.links), knowledge_dir)
    emit({"valid": True, "count": len(links)})


def cmd_apply_pending_links(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    pending_path = knowledge_dir / "pending.json"
    links = load_pending_links(Path(args.links), knowledge_dir)
    pending = load_json(pending_path, {})
    if not isinstance(pending, dict):
        fail("pending.json must contain an object")

    applied = 0
    for item in links:
        source = pending[item["source_id"]]
        relations = source.get("relations")
        if not isinstance(relations, list):
            relations = []
        existing = {
            relation_key(rel)
            for rel in relations
            if isinstance(rel, dict) and rel.get("type") == "link"
        }
        rel = item["relation"]
        if relation_key(rel) not in existing:
            relations.append(rel)
            source["relations"] = relations
            applied += 1

    write_json(pending_path, pending)
    emit({"applied": applied, "links": len(links), "pending_path": str(pending_path)})


def cmd_finalize(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    ensure_knowledge_layout(knowledge_dir)
    stage1_path = knowledge_dir / "distill_stage1.json"
    pending_path = knowledge_dir / "pending.json"
    dup_path = knowledge_dir / "duplicates.json"

    raw = json.loads(Path(args.judgment).expanduser().read_text())
    judgment = validate_judgment_object(raw)
    pid = args.candidate_id
    stage1 = load_json(stage1_path, {})
    if not isinstance(stage1, dict):
        fail("distill_stage1.json must contain an object")
    pending = load_json(pending_path, {})
    if not isinstance(pending, dict):
        fail("pending.json must contain an object")
    if pid not in stage1:
        fail(f"candidate {pid} not in distill_stage1.json")

    body = stage1[pid]
    m1 = judgment["m1_judgment"]
    canon = all_canonical(knowledge_dir)
    referenced_ids = {nb["id"] for nb in judgment["m1_neighbors"]}
    if judgment["matched_canonical_id"]:
        referenced_ids.add(judgment["matched_canonical_id"])
    missing_ids = sorted(cid for cid in referenced_ids if cid not in canon)
    if missing_ids:
        fail(f"judgment references canonical ids not found: {', '.join(missing_ids)}")

    if m1 == "update":
        first_id = judgment["m1_neighbors"][0]["id"]
        neighbor = canon[first_id]
        if neighbor.get("form") != body.get("form"):
            fail(
                "update judgment violates form constraint: "
                f"candidate form {body.get('form')!r} vs neighbor {first_id} "
                f"form {neighbor.get('form')!r}"
            )

    body["m1_judgment"] = m1
    body["m1_neighbors"] = judgment["m1_neighbors"]
    body["m1_merge_preview"] = judgment["m1_merge_preview"]

    if m1 == "duplicate":
        duplicates = load_json(dup_path, {})
        if not isinstance(duplicates, dict):
            fail("duplicates.json must contain an object")
        body["matched_canonical_id"] = judgment["matched_canonical_id"]
        body["duplicated_at"] = utc_now_iso()
        duplicates[pid] = body
        write_json(dup_path, duplicates)
    else:
        if pid in pending:
            fail(f"candidate {pid} already exists in pending.json")
        # canonical relations are intentionally coarse links; m1_neighbors keeps
        # the more specific suggested_relation for UI display.
        body["relations"] = [
            {"type": "link", "id": nb["id"]}
            for nb in body["m1_neighbors"]
            if "id" in nb
        ]
        pending[pid] = body

    del stage1[pid]
    write_json(stage1_path, stage1)
    write_json(pending_path, pending)
    emit({"id": pid, "judgment": m1})


def cmd_commit_cursor(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    ensure_knowledge_layout(knowledge_dir)
    cursor_path = knowledge_dir / "history.json"
    cursor = load_json(cursor_path, {"sessions": {}, "last_run_at": None})
    if not isinstance(cursor, dict):
        fail("history.json must contain an object")
    position = args.position or args.uuid
    if not position:
        fail("commit-cursor requires --position or --uuid")
    now = utc_now_iso()
    cursor.setdefault("sessions", {})
    entry = {
        "last_processed_cursor": position,
        "processed_at": now,
    }
    if args.uuid:
        entry["last_processed_uuid"] = args.uuid
    if args.agent:
        entry["agent"] = args.agent
    cursor["sessions"][args.session_id] = entry
    cursor["last_run_at"] = now
    write_json(cursor_path, cursor)
    emit({
        "session_id": args.session_id,
        "last_processed_cursor": position,
        "last_processed_uuid": args.uuid,
    })


def cmd_validate_store(args) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    errors: list[str] = []
    for name in [
        "distill_stage1.json",
        "pending.json",
        "duplicates.json",
        "rejected.json",
        "history.json",
    ]:
        path = knowledge_dir / name
        try:
            value = load_json(path, {})
            if not isinstance(value, dict):
                errors.append(f"{name} must contain an object")
        except Exception as exc:
            errors.append(f"{name}: {exc}")
    for jp in sorted((knowledge_dir / "canonical").glob("*.json")):
        try:
            value = load_json(jp, {})
            if not isinstance(value, dict):
                errors.append(f"{jp.name} must contain an object")
        except Exception as exc:
            errors.append(f"{jp.name}: {exc}")
    if errors:
        raise ValidationError("; ".join(errors))
    emit({"valid": True, "knowledge_dir": str(knowledge_dir)})


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init", help="initialize knowledge directory files")
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("list-sessions", help="list project jsonl files and cursor state")
    p.add_argument("--project-dir", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_list_sessions)

    p = sub.add_parser("list-agent-sessions", help="list registered agent sessions")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--agent", choices=["all", "claudecode", "codex"], default="all")
    p.add_argument("--claudecode-root", default=str(default_agent_roots()["claudecode"]))
    p.add_argument("--codex-root", default=str(default_agent_roots()["codex"]))
    p.add_argument("--limit", type=int, default=80)
    p.add_argument("--format", choices=["json", "markdown"], default="json")
    p.add_argument("--session-kind", choices=sorted(SESSION_KINDS), default="main")
    p.set_defaults(func=cmd_list_agent_sessions)

    p = sub.add_parser("preprocess", help="jsonl + cursor -> display text chunk")
    p.add_argument("--jsonl", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--agent", choices=["auto", "claudecode", "codex"], default="auto")
    p.add_argument("--session-key")
    p.add_argument("--threshold-bytes", type=int, default=600_000)
    p.add_argument("--allow-over-threshold", action="store_true")
    p.add_argument("--allow-non-main", action="store_true")
    p.add_argument("--out")
    p.set_defaults(func=cmd_preprocess)

    p = sub.add_parser("validate-extraction", help="validate first LLM JSON array")
    p.add_argument("--extraction", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_validate_extraction)

    p = sub.add_parser("capture", help="validate extraction and append candidates to stage1")
    p.add_argument("--extraction", required=True)
    p.add_argument("--session-id", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_capture)

    p = sub.add_parser("dump-canonical-index", help="dump id/form/domain/title/abstract index")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--domain", help="only include canonical entries with this exact domain")
    p.set_defaults(func=cmd_dump_canonical_index)

    p = sub.add_parser("dump-pending-index", help="dump id/form/domain/title/abstract index")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--ids", help="only include these comma-separated pending ids")
    p.add_argument("--domain", help="only include pending entries with this exact domain")
    p.set_defaults(func=cmd_dump_pending_index)

    p = sub.add_parser("list-pending", help="list pending candidates")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--unclassified", action="store_true")
    p.add_argument("--session-id")
    p.set_defaults(func=cmd_list_pending)

    p = sub.add_parser("list-stage1", help="list first-stage candidates waiting for merge")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--session-id")
    p.set_defaults(func=cmd_list_stage1)

    p = sub.add_parser("get-candidate", help="print a pending candidate by id")
    p.add_argument("--candidate-id", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_get_candidate)

    p = sub.add_parser("get-stage1-candidate", help="print a first-stage candidate by id")
    p.add_argument("--candidate-id", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_get_stage1_candidate)

    p = sub.add_parser("get-canonical", help="print canonical entries by comma-separated ids")
    p.add_argument("--ids", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_get_canonical)

    p = sub.add_parser("validate-judgment", help="validate second LLM JSON object")
    p.add_argument("--judgment", required=True)
    p.set_defaults(func=cmd_validate_judgment)

    p = sub.add_parser("validate-pending-links", help="validate pending relation JSON array")
    p.add_argument("--links", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_validate_pending_links)

    p = sub.add_parser("apply-pending-links", help="append validated link relations to pending")
    p.add_argument("--links", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_apply_pending_links)

    p = sub.add_parser("finalize", help="validate judgment and update pending/duplicates")
    p.add_argument("--candidate-id", required=True)
    p.add_argument("--judgment", required=True)
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_finalize)

    p = sub.add_parser("commit-cursor", help="advance one session cursor after finalize")
    p.add_argument("--session-id", required=True)
    p.add_argument("--uuid")
    p.add_argument("--position")
    p.add_argument("--agent", choices=["claudecode", "codex"])
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_commit_cursor)

    p = sub.add_parser("validate-store", help="validate basic knowledge directory JSON shape")
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_validate_store)

    return ap


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except ValidationError as exc:
        fail(str(exc))


if __name__ == "__main__":
    main()
