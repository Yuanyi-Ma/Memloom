#!/usr/bin/env python3
"""Deterministic helpers for the recall skill.

The skill around this script handles text interaction. This script only reads
canonical knowledge, plans review items, and records review outcomes with a
lightweight forgetting-curve scheduler.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ALLOWED_FORMS = {"practice", "methodology", "theory"}
ALLOWED_GRADES = {"familiar", "shaky", "unknown"}
ALLOWED_MODES = {"list", "qa"}
TARGET_RETENTION = 0.85
INITIAL_STABILITY_DAYS = 1.0 / -math.log(TARGET_RETENTION)
INITIAL_DIFFICULTY = 0.5
MAX_INTERVAL_DAYS = 120
MAX_STABILITY_DAYS = MAX_INTERVAL_DAYS / -math.log(TARGET_RETENTION)


class ValidationError(Exception):
    pass


def emit(obj: Any) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def fail(message: str) -> None:
    sys.exit(f"ERROR: {message}")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today_iso() -> str:
    return date.today().isoformat()


def parse_date(value: str | None) -> date:
    if value is None:
        return date.today()
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError(f"invalid date: {value}") from exc


def parse_iso_date(value: Any) -> date | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    try:
        if "T" in text:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        return date.fromisoformat(text)
    except ValueError:
        return None


def load_json(path: Path, default: Any) -> Any:
    if path.exists() and path.stat().st_size > 0:
        return json.loads(path.read_text())
    return default


def write_json_atomic(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{datetime.now().timestamp()}.tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")
    tmp.replace(path)


def append_jsonl(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(obj, ensure_ascii=False) + "\n")


def ensure_layout(knowledge_dir: Path) -> None:
    (knowledge_dir / "canonical").mkdir(parents=True, exist_ok=True)
    state_path = knowledge_dir / "review_state.json"
    if not state_path.exists():
        write_json_atomic(state_path, {"version": 1, "items": {}})
    log_path = knowledge_dir / "review_log.jsonl"
    if not log_path.exists():
        log_path.write_text("")


def state_path(knowledge_dir: Path) -> Path:
    return knowledge_dir / "review_state.json"


def log_path(knowledge_dir: Path) -> Path:
    return knowledge_dir / "review_log.jsonl"


def load_state(knowledge_dir: Path) -> dict[str, Any]:
    ensure_layout(knowledge_dir)
    state = load_json(state_path(knowledge_dir), {"version": 1, "items": {}})
    if not isinstance(state, dict):
        raise ValidationError("review_state.json must contain an object")
    items = state.get("items")
    if not isinstance(items, dict):
        state["items"] = {}
    if state.get("version") is None:
        state["version"] = 1
    return state


def save_state(knowledge_dir: Path, state: dict[str, Any]) -> None:
    write_json_atomic(state_path(knowledge_dir), state)


def canonical_entries(knowledge_dir: Path) -> dict[str, dict[str, Any]]:
    canonical_dir = knowledge_dir / "canonical"
    out: dict[str, dict[str, Any]] = {}
    if not canonical_dir.is_dir():
        return out
    for jp in sorted(canonical_dir.glob("*.json")):
        data = load_json(jp, {})
        if not isinstance(data, dict):
            continue
        for cid, body in data.items():
            if not isinstance(body, dict):
                continue
            item = dict(body)
            item["id"] = str(item.get("id") or cid)
            out[str(cid)] = item
    return out


def attribution(item: dict[str, Any]) -> dict[str, Any]:
    value = item.get("attribution")
    return value if isinstance(value, dict) else {}


def is_invalidated(item: dict[str, Any]) -> bool:
    temporal = item.get("temporal")
    return isinstance(temporal, dict) and bool(temporal.get("invalid_at"))


def is_human_usable(item: dict[str, Any]) -> bool:
    if is_invalidated(item):
        return False
    form = item.get("form")
    human = item.get("human")
    if form in {"theory", "methodology"} and isinstance(human, str) and human.strip():
        return True
    if form == "practice" and attribution(item).get("claim_owner") == "user":
        return True
    return False


def default_state_item() -> dict[str, Any]:
    return {
        "status": "new",
        "due_at": today_iso(),
        "interval_days": 1,
        "stability_days": round(INITIAL_STABILITY_DAYS, 4),
        "difficulty": INITIAL_DIFFICULTY,
        "last_reviewed_at": None,
        "review_count": 0,
        "lapse_count": 0,
        "last_grade": None,
        "mode_preference": "auto",
        "last_mode": None,
    }


def normalized_state_item(raw: Any) -> dict[str, Any]:
    base = default_state_item()
    if isinstance(raw, dict):
        base.update(raw)
    if base.get("status") not in {"new", "reviewing", "suspended"}:
        base["status"] = "reviewing"
    try:
        base["stability_days"] = float(base.get("stability_days"))
    except (TypeError, ValueError):
        base["stability_days"] = INITIAL_STABILITY_DAYS
    try:
        base["difficulty"] = float(base.get("difficulty"))
    except (TypeError, ValueError):
        base["difficulty"] = INITIAL_DIFFICULTY
    try:
        base["interval_days"] = int(base.get("interval_days"))
    except (TypeError, ValueError):
        base["interval_days"] = 1
    try:
        base["review_count"] = int(base.get("review_count"))
    except (TypeError, ValueError):
        base["review_count"] = 0
    try:
        base["lapse_count"] = int(base.get("lapse_count"))
    except (TypeError, ValueError):
        base["lapse_count"] = 0
    return base


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def interval_from_stability(stability_days: float) -> int:
    days = math.ceil(-float(stability_days) * math.log(TARGET_RETENTION))
    return max(1, min(MAX_INTERVAL_DAYS, int(days)))


def retention_on(day: date, item_state: dict[str, Any]) -> float | None:
    last = parse_iso_date(item_state.get("last_reviewed_at"))
    if last is None:
        return None
    elapsed = max(0, (day - last).days)
    stability = max(0.1, float(item_state.get("stability_days") or INITIAL_STABILITY_DAYS))
    return math.exp(-elapsed / stability)


def next_state_after_review(
    item_state: dict[str, Any],
    *,
    grade: str,
    mode: str,
    reviewed_day: date,
    reviewed_at: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if grade not in ALLOWED_GRADES:
        raise ValidationError(f"grade must be one of {sorted(ALLOWED_GRADES)}")
    if mode not in ALLOWED_MODES:
        raise ValidationError(f"mode must be one of {sorted(ALLOWED_MODES)}")

    old = normalized_state_item(item_state)
    old_interval = max(1, int(old.get("interval_days") or 1))
    old_stability = max(0.1, float(old.get("stability_days") or INITIAL_STABILITY_DAYS))
    old_difficulty = clamp(float(old.get("difficulty") or INITIAL_DIFFICULTY), 0.05, 0.99)

    if grade == "familiar":
        growth = 2.5 - 0.6 * old_difficulty
        new_stability = old_stability * growth
        new_difficulty = old_difficulty - 0.08
        interval = interval_from_stability(new_stability)
        mode_preference = "list" if old.get("last_grade") == "familiar" else "auto"
    elif grade == "shaky":
        growth = 1.25 - 0.25 * old_difficulty
        new_stability = old_stability * growth
        new_difficulty = old_difficulty + 0.05
        interval = min(interval_from_stability(new_stability), old_interval)
        mode_preference = "qa"
    else:
        new_stability = INITIAL_STABILITY_DAYS
        new_difficulty = old_difficulty + 0.15
        interval = 1
        mode_preference = "qa"

    interval = max(1, min(MAX_INTERVAL_DAYS, interval))
    new_stability = clamp(new_stability, INITIAL_STABILITY_DAYS, MAX_STABILITY_DAYS)
    new_difficulty = clamp(new_difficulty, 0.05, 0.99)
    due = reviewed_day + timedelta(days=interval)

    new = {
        **old,
        "status": "reviewing",
        "due_at": due.isoformat(),
        "interval_days": interval,
        "stability_days": round(new_stability, 4),
        "difficulty": round(new_difficulty, 4),
        "last_reviewed_at": reviewed_at,
        "review_count": int(old.get("review_count") or 0) + 1,
        "lapse_count": int(old.get("lapse_count") or 0) + (1 if grade == "unknown" else 0),
        "last_grade": grade,
        "mode_preference": mode_preference,
        "last_mode": mode,
    }
    delta = {
        "old_interval_days": old_interval,
        "new_interval_days": interval,
        "old_due_at": old.get("due_at"),
        "new_due_at": due.isoformat(),
        "old_stability_days": old_stability,
        "new_stability_days": new["stability_days"],
        "old_difficulty": old_difficulty,
        "new_difficulty": new["difficulty"],
    }
    return new, delta


def relation_ids(item: dict[str, Any]) -> list[str]:
    out: list[str] = []
    relations = item.get("relations")
    if not isinstance(relations, list):
        return out
    for rel in relations:
        if isinstance(rel, dict) and rel.get("id"):
            out.append(str(rel["id"]))
    return out


def reason_for(item_state: dict[str, Any], day: date) -> tuple[bool, str, int]:
    state = normalized_state_item(item_state)
    if state.get("status") == "suspended":
        return False, "suspended", -999
    if not state.get("last_reviewed_at"):
        return True, "new", 90
    due = parse_iso_date(state.get("due_at"))
    if due is None:
        return True, "missing_due_at", 80
    overdue = (day - due).days
    if overdue < 0:
        return False, "not_due", -overdue
    grade = state.get("last_grade")
    if grade in {"shaky", "unknown"}:
        return True, "due_and_weak", 120 + overdue
    return True, "due", 70 + overdue


def question_style(item: dict[str, Any]) -> str:
    form = item.get("form")
    title = str(item.get("title") or "")
    abstract = str(item.get("abstract") or "")
    domain = str(item.get("domain") or "")
    haystack = title + "\n" + abstract + "\n" + domain
    if any(token in haystack for token in ["表达", "写作", "论证", "叙事", "汇报", "prompt", "结构"]):
        return "expression_structure"
    if form == "theory" or any(token in haystack for token in ["理论", "机制", "科学", "科研", "论文", "实验", "原理"]):
        return "research_theory"
    if form == "practice" and attribution(item).get("claim_owner") == "user":
        return "personal_practice"
    if any(token in haystack for token in ["分类", "对照", "区别", "层级", "框架"]):
        return "factual_framework"
    return "methodology"


def choose_mode(item: dict[str, Any], item_state: dict[str, Any]) -> str:
    state = normalized_state_item(item_state)
    if item.get("form") == "practice" and attribution(item).get("claim_owner") == "user":
        return "list"
    pref = state.get("mode_preference")
    if pref in {"list", "qa"}:
        return pref
    if state.get("last_grade") in {"shaky", "unknown"}:
        return "qa"
    if not state.get("last_reviewed_at") and item.get("form") in {"methodology", "theory"}:
        return "qa"
    return "list"


def compact_item(cid: str, item: dict[str, Any], item_state: dict[str, Any], *, reason: str, score: int, day: date) -> dict[str, Any]:
    retention = retention_on(day, item_state)
    return {
        "id": cid,
        "title": item.get("title"),
        "domain": item.get("domain"),
        "form": item.get("form"),
        "abstract": item.get("abstract"),
        "agent": item.get("agent"),
        "human": item.get("human"),
        "attribution": item.get("attribution"),
        "relations": item.get("relations", []),
        "mode": choose_mode(item, item_state),
        "question_style": question_style(item),
        "reason": reason,
        "score": score,
        "state": normalized_state_item(item_state),
        "retention": None if retention is None else round(retention, 4),
    }


def build_plan(
    knowledge_dir: Path,
    *,
    day: date,
    limit: int,
    qa_limit: int,
    domain: str | None,
    mode: str | None,
) -> dict[str, Any]:
    state = load_state(knowledge_dir)
    all_items = canonical_entries(knowledge_dir)
    state_items = state.get("items", {})
    candidates: list[dict[str, Any]] = []
    selected_ids: set[str] = set()

    for cid, item in sorted(all_items.items()):
        if not is_human_usable(item):
            continue
        if domain and item.get("domain") != domain:
            continue
        item_state = normalized_state_item(state_items.get(cid))
        due, reason, score = reason_for(item_state, day)
        if not due:
            continue
        candidates.append(compact_item(cid, item, item_state, reason=reason, score=score, day=day))
        selected_ids.add(cid)

    candidates.sort(key=lambda x: (-int(x["score"]), str(x.get("domain") or ""), str(x.get("title") or "")))

    # Pull a few same-domain relation neighbors into list mode for context.
    if len(candidates) < limit:
        for seed in list(candidates):
            if len(candidates) >= limit:
                break
            seed_item = all_items.get(seed["id"], {})
            for rid in relation_ids(seed_item):
                if len(candidates) >= limit:
                    break
                if rid in selected_ids:
                    continue
                neighbor = all_items.get(rid)
                if not neighbor or not is_human_usable(neighbor):
                    continue
                if domain and neighbor.get("domain") != domain:
                    continue
                if neighbor.get("domain") != seed_item.get("domain"):
                    continue
                neighbor_state = normalized_state_item(state_items.get(rid))
                if neighbor_state.get("status") == "suspended":
                    continue
                body = compact_item(
                    rid,
                    neighbor,
                    neighbor_state,
                    reason="related_neighbor",
                    score=25,
                    day=day,
                )
                body["mode"] = "list"
                candidates.append(body)
                selected_ids.add(rid)

    candidates = candidates[: max(0, limit)]

    if mode in {"list", "qa"}:
        for item in candidates:
            item["mode"] = mode
    else:
        qa_used = 0
        for item in candidates:
            if item["mode"] == "qa" and qa_used < qa_limit:
                qa_used += 1
            else:
                item["mode"] = "list"

    by_domain: dict[str, int] = {}
    by_mode: dict[str, int] = {"list": 0, "qa": 0}
    by_reason: dict[str, int] = {}
    for item in candidates:
        by_domain[str(item.get("domain") or "_unknown")] = by_domain.get(str(item.get("domain") or "_unknown"), 0) + 1
        by_mode[str(item["mode"])] = by_mode.get(str(item["mode"]), 0) + 1
        by_reason[str(item["reason"])] = by_reason.get(str(item["reason"]), 0) + 1

    return {
        "date": day.isoformat(),
        "target_retention": TARGET_RETENTION,
        "limit": limit,
        "qa_limit": qa_limit,
        "domain": domain,
        "mode": mode or "auto",
        "count": len(candidates),
        "summary": {
            "by_domain": by_domain,
            "by_mode": by_mode,
            "by_reason": by_reason,
        },
        "items": candidates,
    }


def read_text_arg(value: str | None, file_value: str | None) -> str | None:
    if file_value:
        return Path(file_value).expanduser().read_text().strip()
    if value is None:
        return None
    return value.strip()


def cmd_init(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    ensure_layout(knowledge_dir)
    emit({
        "ok": True,
        "state_path": str(state_path(knowledge_dir)),
        "log_path": str(log_path(knowledge_dir)),
    })


def cmd_plan(args: argparse.Namespace) -> None:
    try:
        day = parse_date(args.date)
        plan = build_plan(
            Path(args.knowledge_dir).expanduser().resolve(),
            day=day,
            limit=args.limit,
            qa_limit=args.qa_limit,
            domain=args.domain,
            mode=args.mode,
        )
    except ValidationError as exc:
        fail(str(exc))
    emit(plan)


def cmd_record(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    try:
        reviewed_day = parse_date(args.date)
        if args.grade not in ALLOWED_GRADES:
            raise ValidationError(f"grade must be one of {sorted(ALLOWED_GRADES)}")
        if args.mode not in ALLOWED_MODES:
            raise ValidationError(f"mode must be one of {sorted(ALLOWED_MODES)}")

        canonical = canonical_entries(knowledge_dir)
        if args.item_id not in canonical:
            raise ValidationError(f"canonical item not found: {args.item_id}")

        state = load_state(knowledge_dir)
        items = state.setdefault("items", {})
        old_state = normalized_state_item(items.get(args.item_id))
        reviewed_at = args.reviewed_at or utc_now_iso()
        new_state, delta = next_state_after_review(
            old_state,
            grade=args.grade,
            mode=args.mode,
            reviewed_day=reviewed_day,
            reviewed_at=reviewed_at,
        )
        items[args.item_id] = new_state
        save_state(knowledge_dir, state)

        user_summary = read_text_arg(args.user_summary, args.user_summary_file)
        ai_feedback = read_text_arg(args.ai_feedback, args.ai_feedback_file)
        log_entry = {
            "reviewed_at": reviewed_at,
            "item_id": args.item_id,
            "mode": args.mode,
            "grade": args.grade,
            **delta,
            "user_summary": user_summary,
            "ai_feedback": ai_feedback,
        }
        append_jsonl(log_path(knowledge_dir), log_entry)
    except (ValidationError, OSError) as exc:
        fail(str(exc))

    emit({
        "ok": True,
        "item_id": args.item_id,
        "grade": args.grade,
        "mode": args.mode,
        "next_due_at": new_state["due_at"],
        "interval_days": new_state["interval_days"],
        "stability_days": new_state["stability_days"],
        "difficulty": new_state["difficulty"],
        "state_path": str(state_path(knowledge_dir)),
        "log_path": str(log_path(knowledge_dir)),
    })


def cmd_status(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    day = parse_date(args.date)
    state = load_state(knowledge_dir)
    canonical = canonical_entries(knowledge_dir)
    total = 0
    reviewable = 0
    due_count = 0
    weak_count = 0
    suspended_count = 0
    by_domain: dict[str, dict[str, int]] = {}
    for cid, item in canonical.items():
        total += 1
        if not is_human_usable(item):
            continue
        if args.domain and item.get("domain") != args.domain:
            continue
        reviewable += 1
        item_state = normalized_state_item(state.get("items", {}).get(cid))
        domain = str(item.get("domain") or "_unknown")
        by_domain.setdefault(domain, {"reviewable": 0, "due": 0, "weak": 0, "suspended": 0})
        by_domain[domain]["reviewable"] += 1
        if item_state.get("status") == "suspended":
            suspended_count += 1
            by_domain[domain]["suspended"] += 1
            continue
        due, _, _ = reason_for(item_state, day)
        if due:
            due_count += 1
            by_domain[domain]["due"] += 1
        if item_state.get("last_grade") in {"shaky", "unknown"}:
            weak_count += 1
            by_domain[domain]["weak"] += 1
    emit({
        "date": day.isoformat(),
        "canonical_count": total,
        "reviewable_count": reviewable,
        "due_count": due_count,
        "weak_count": weak_count,
        "suspended_count": suspended_count,
        "by_domain": by_domain,
    })


def cmd_suspend(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    canonical = canonical_entries(knowledge_dir)
    if args.item_id not in canonical:
        fail(f"canonical item not found: {args.item_id}")
    state = load_state(knowledge_dir)
    items = state.setdefault("items", {})
    item_state = normalized_state_item(items.get(args.item_id))
    item_state["status"] = "suspended"
    items[args.item_id] = item_state
    save_state(knowledge_dir, state)
    emit({"ok": True, "item_id": args.item_id, "status": "suspended"})


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init", help="initialize recall state files")
    p.add_argument("--knowledge-dir", required=True)
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("plan", help="build a human review plan")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--date")
    p.add_argument("--limit", type=int, default=8)
    p.add_argument("--qa-limit", type=int, default=3)
    p.add_argument("--domain")
    p.add_argument("--mode", choices=["list", "qa"])
    p.set_defaults(func=cmd_plan)

    p = sub.add_parser("record", help="record one review result")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--item-id", required=True)
    p.add_argument("--mode", choices=sorted(ALLOWED_MODES), required=True)
    p.add_argument("--grade", choices=sorted(ALLOWED_GRADES), required=True)
    p.add_argument("--date")
    p.add_argument("--reviewed-at")
    p.add_argument("--user-summary")
    p.add_argument("--user-summary-file")
    p.add_argument("--ai-feedback")
    p.add_argument("--ai-feedback-file")
    p.set_defaults(func=cmd_record)

    p = sub.add_parser("status", help="summarize recall state")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--date")
    p.add_argument("--domain")
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("suspend", help="suspend one canonical item from recall")
    p.add_argument("--knowledge-dir", required=True)
    p.add_argument("--item-id", required=True)
    p.set_defaults(func=cmd_suspend)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON: {exc}")
    except ValidationError as exc:
        fail(str(exc))


if __name__ == "__main__":
    main()
