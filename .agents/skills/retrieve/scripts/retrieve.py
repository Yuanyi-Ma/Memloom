#!/usr/bin/env python3
"""Read-only helpers for using the canonical knowledge base.

Normal commands do not mutate project knowledge. The only write command is
`rebuild-index`, which deterministically regenerates agent_index.md and
agent_views/*.md from already accepted canonical items.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CJK_RE = re.compile(r"[\u4e00-\u9fff]+")
TOKEN_RE = re.compile(r"[a-z0-9_]+|[\u4e00-\u9fff]+")


def emit(obj: Any) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def fail(message: str) -> None:
    sys.exit(f"ERROR: {message}")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists() or path.stat().st_size == 0:
        return default
    text = path.read_text()
    if not text.strip():
        return default
    return json.loads(text)


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text)
    tmp.replace(path)


def read_whitelist(knowledge_dir: Path) -> list[str]:
    path = knowledge_dir / "whitelist.yaml"
    if not path.exists():
        return []

    domains: list[str] = []
    in_domains = False
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line == "domains:":
            in_domains = True
            continue
        if in_domains and line.startswith("- "):
            domain = line[2:].strip()
            if domain:
                domains.append(domain)
            continue
        if in_domains and not raw.startswith((" ", "\t", "-")):
            in_domains = False
    return domains


def is_active(item: dict[str, Any]) -> bool:
    temporal = item.get("temporal")
    if isinstance(temporal, dict) and temporal.get("invalid_at"):
        return False
    return True


def canonical_items(knowledge_dir: Path, *, include_invalid: bool = False) -> dict[str, dict[str, Any]]:
    canonical_dir = knowledge_dir / "canonical"
    items: dict[str, dict[str, Any]] = {}
    if not canonical_dir.is_dir():
        return items

    for path in sorted(canonical_dir.glob("*.json")):
        data = load_json(path, {})
        if not isinstance(data, dict):
            continue
        for raw_id, raw_item in data.items():
            if not isinstance(raw_item, dict):
                continue
            item = dict(raw_item)
            cid = str(item.get("id") or raw_id)
            item["id"] = cid
            item.setdefault("domain", path.stem)
            if include_invalid or is_active(item):
                items[cid] = item
    return items


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def compact_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def truncate(value: Any, limit: int = 180) -> str | None:
    text = compact_space(clean_text(value))
    if not text:
        return None
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


def query_terms(query: str) -> list[str]:
    raw_terms = TOKEN_RE.findall(query.lower())
    terms: list[str] = []
    for term in raw_terms:
        if term not in terms:
            terms.append(term)
        if CJK_RE.fullmatch(term) and len(term) > 2:
            for idx in range(len(term) - 1):
                bigram = term[idx : idx + 2]
                if bigram not in terms:
                    terms.append(bigram)
    return terms


def field_score(terms: list[str], text: Any, weight: float) -> float:
    hay = clean_text(text).lower()
    if not hay:
        return 0.0
    return sum(weight for term in terms if term and term in hay)


def score_item(item: dict[str, Any], query: str) -> float:
    normalized_query = compact_space(query.lower())
    terms = query_terms(query)
    if not terms and not normalized_query:
        return 0.0

    title = clean_text(item.get("title")).lower()
    abstract = clean_text(item.get("abstract")).lower()
    domain = clean_text(item.get("domain")).lower()
    form = clean_text(item.get("form")).lower()
    agent = clean_text(item.get("agent")).lower()
    human = clean_text(item.get("human")).lower()
    full = "\n".join([title, abstract, domain, form, agent, human])

    score = 0.0
    if normalized_query:
        if normalized_query in title:
            score += 20.0
        if normalized_query in abstract:
            score += 12.0
        if normalized_query in full:
            score += 6.0
    score += field_score(terms, title, 10.0)
    score += field_score(terms, abstract, 6.0)
    score += field_score(terms, domain, 2.0)
    score += field_score(terms, form, 2.0)
    score += field_score(terms, agent, 3.0)
    score += field_score(terms, human, 3.0)
    return score


def item_summary(item: dict[str, Any], *, score: float | None = None) -> dict[str, Any]:
    relations = item.get("relations")
    if not isinstance(relations, list):
        relations = []
    out: dict[str, Any] = {
        "id": item.get("id"),
        "title": item.get("title"),
        "domain": item.get("domain"),
        "form": item.get("form"),
        "abstract": truncate(item.get("abstract"), 220),
        "agent_useful": bool(clean_text(item.get("agent")).strip()),
        "human_useful": bool(clean_text(item.get("human")).strip()),
        "relation_count": len(relations),
    }
    if score is not None:
        out["score"] = round(score, 4)
    return out


def domain_order(knowledge_dir: Path, items: dict[str, dict[str, Any]]) -> list[str]:
    seen = {(clean_text(item.get("domain")) or "_unknown") for item in items.values()}
    ordered = [domain for domain in read_whitelist(knowledge_dir) if domain in seen]
    ordered.extend(sorted(domain for domain in seen if domain and domain not in ordered))
    return ordered


def grouped_by_domain(items: dict[str, dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items.values():
        domain = clean_text(item.get("domain")) or "_unknown"
        groups[domain].append(item)
    for entries in groups.values():
        entries.sort(key=lambda body: clean_text(body.get("id")))
    return groups


def render_index(knowledge_dir: Path, items: dict[str, dict[str, Any]]) -> str:
    groups = grouped_by_domain(items)
    lines = [
        "# Agent Knowledge Index",
        "",
        f"Generated: {utc_now_iso()}",
        "",
        "Use `retrieve.py get --ids <id>` to read concrete canonical entries.",
        "",
        "## Domains",
    ]
    for domain in domain_order(knowledge_dir, items):
        lines.append(f"- {domain}: {len(groups[domain])}")
    if not groups:
        lines.append("- empty: 0")

    for domain in domain_order(knowledge_dir, items):
        lines.extend(["", f"## {domain}"])
        for item in groups[domain]:
            form = clean_text(item.get("form")) or "unknown"
            title = clean_text(item.get("title")) or clean_text(item.get("id"))
            abstract = truncate(item.get("abstract"), 180) or ""
            lines.append(f"- `{item['id']}` [{form}] {title}: {abstract}")
    lines.append("")
    return "\n".join(lines)


def render_domain_view(domain: str, items: list[dict[str, Any]]) -> str:
    lines = [f"# Domain: {domain}", ""]
    if not items:
        lines.append("No active canonical knowledge.")
        lines.append("")
        return "\n".join(lines)
    for item in items:
        relations = item.get("relations")
        if not isinstance(relations, list):
            relations = []
        relation_ids = [
            clean_text(rel.get("id"))
            for rel in relations
            if isinstance(rel, dict) and rel.get("type") == "link" and rel.get("id")
        ]
        lines.extend(
            [
                f"## {item['id']} {clean_text(item.get('title'))}",
                "",
                f"- form: {clean_text(item.get('form')) or 'unknown'}",
                f"- abstract: {truncate(item.get('abstract'), 500) or ''}",
                f"- agent: {truncate(item.get('agent'), 700) or ''}",
                f"- human: {truncate(item.get('human'), 700) or ''}",
            ]
        )
        if relation_ids:
            lines.append(f"- relations: {', '.join(relation_ids)}")
        lines.append("")
    return "\n".join(lines)


def cmd_index(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    index_path = knowledge_dir / "agent_index.md"
    if index_path.exists():
        emit({"ok": True, "exists": True, "path": str(index_path), "content": index_path.read_text()})
        return

    items = canonical_items(knowledge_dir)
    emit(
        {
            "ok": True,
            "exists": False,
            "path": str(index_path),
            "content": render_index(knowledge_dir, items),
            "hint": "agent_index.md does not exist yet; run rebuild-index during maintenance if a persisted index is needed.",
        }
    )


def cmd_rebuild_index(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    items = canonical_items(knowledge_dir)
    index_path = knowledge_dir / "agent_index.md"
    views_dir = knowledge_dir / "agent_views"
    write_text_atomic(index_path, render_index(knowledge_dir, items))

    groups = grouped_by_domain(items)
    written_views: list[str] = []
    for domain in domain_order(knowledge_dir, items):
        path = views_dir / f"{domain}.md"
        write_text_atomic(path, render_domain_view(domain, groups[domain]))
        written_views.append(str(path))

    emit(
        {
            "ok": True,
            "index_path": str(index_path),
            "view_paths": written_views,
            "item_count": len(items),
            "domain_count": len(groups),
        }
    )


def cmd_domains(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    items = canonical_items(knowledge_dir)
    groups = grouped_by_domain(items)
    out = []
    for domain in domain_order(knowledge_dir, items):
        forms = Counter(clean_text(item.get("form")) or "unknown" for item in groups[domain])
        out.append({"domain": domain, "count": len(groups[domain]), "forms": dict(sorted(forms.items()))})
    emit({"total": len(items), "domains": out, "whitelist": read_whitelist(knowledge_dir)})


def cmd_search(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    query = args.query.strip()
    if not query:
        fail("search requires --query")

    items = canonical_items(knowledge_dir, include_invalid=args.include_invalid)
    scored: list[tuple[float, dict[str, Any]]] = []
    for item in items.values():
        if args.domain and clean_text(item.get("domain")) != args.domain:
            continue
        score = score_item(item, query)
        if score > 0:
            scored.append((score, item))
    scored.sort(key=lambda pair: (-pair[0], clean_text(pair[1].get("id"))))
    limited = scored[: max(0, args.limit)]

    emit(
        {
            "query": query,
            "domain": args.domain,
            "count": len(limited),
            "total_matches": len(scored),
            "items": [item_summary(item, score=score) for score, item in limited],
        }
    )


def parse_ids(raw: str) -> list[str]:
    ids = [part.strip() for part in re.split(r"[\s,]+", raw) if part.strip()]
    seen: set[str] = set()
    out: list[str] = []
    for cid in ids:
        if cid not in seen:
            out.append(cid)
            seen.add(cid)
    return out


def cmd_get(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    items = canonical_items(knowledge_dir, include_invalid=True)
    requested = parse_ids(args.ids)
    found: list[dict[str, Any]] = []
    missing: list[str] = []
    for cid in requested:
        item = items.get(cid)
        if item is None:
            missing.append(cid)
            continue
        if args.brief:
            found.append(item_summary(item))
        else:
            out = dict(item)
            out["active"] = is_active(item)
            found.append(out)
    emit({"items": found, "missing": missing})


def relation_target(rel: dict[str, Any]) -> str:
    target = rel.get("target")
    if target in {"canonical", "pending"}:
        return str(target)
    rid = clean_text(rel.get("id"))
    return "pending" if rid.startswith("p_") else "canonical"


def cmd_related(args: argparse.Namespace) -> None:
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve()
    items = canonical_items(knowledge_dir, include_invalid=True)
    source = items.get(args.id)
    if source is None:
        fail(f"canonical id not found: {args.id}")

    raw_relations = source.get("relations")
    if not isinstance(raw_relations, list):
        raw_relations = []

    relations: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    for rel in raw_relations:
        if not isinstance(rel, dict) or rel.get("type") != "link":
            continue
        target_id = clean_text(rel.get("id"))
        target_type = relation_target(rel)
        if not target_id:
            continue
        if target_type != "canonical":
            missing.append({"id": target_id, "target": target_type, "reason": rel.get("reason")})
            continue
        target = items.get(target_id)
        if target is None:
            missing.append({"id": target_id, "target": target_type, "reason": rel.get("reason")})
            continue
        relations.append(
            {
                "relation": rel,
                "item": item_summary(target) if args.brief else target,
            }
        )
        if len(relations) >= args.limit:
            break

    emit({"id": args.id, "relations": relations, "missing": missing})


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read canonical project knowledge.")
    parser.add_argument(
        "--knowledge-dir",
        default=str(Path.cwd() / "knowledge"),
        help="Project knowledge directory. Defaults to $PWD/knowledge.",
    )
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--knowledge-dir",
        default=argparse.SUPPRESS,
        help="Project knowledge directory. Defaults to $PWD/knowledge.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("index", parents=[common], help="print agent_index.md or a generated preview")
    p.set_defaults(func=cmd_index)

    p = sub.add_parser(
        "rebuild-index", parents=[common], help="regenerate agent_index.md and agent_views/*.md"
    )
    p.set_defaults(func=cmd_rebuild_index)

    p = sub.add_parser("domains", parents=[common], help="list domain counts")
    p.set_defaults(func=cmd_domains)

    p = sub.add_parser("search", parents=[common], help="lexically search canonical knowledge")
    p.add_argument("--query", required=True)
    p.add_argument("--domain")
    p.add_argument("--limit", type=int, default=5)
    p.add_argument("--include-invalid", action="store_true")
    p.set_defaults(func=cmd_search)

    p = sub.add_parser("get", parents=[common], help="get canonical items by id")
    p.add_argument("--ids", required=True)
    p.add_argument("--brief", action="store_true")
    p.set_defaults(func=cmd_get)

    p = sub.add_parser("related", parents=[common], help="get canonical link relations for an item")
    p.add_argument("--id", required=True)
    p.add_argument("--limit", type=int, default=10)
    p.add_argument("--brief", action="store_true")
    p.set_defaults(func=cmd_related)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
