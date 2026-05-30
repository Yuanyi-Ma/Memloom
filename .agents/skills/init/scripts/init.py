#!/usr/bin/env python3
"""Initialize and check the distill knowledge workspace."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


DEFAULT_DOMAINS = ["blockchain", "ai", "writing", "system", "life"]


class InitError(Exception):
    pass


def emit(obj: Any) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def read_json(path: Path, default: Any) -> Any:
    if not path.exists() or path.stat().st_size == 0:
        return default
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        return default
    return json.loads(text)


def write_json_atomic(path: Path, value: Any, *, dry_run: bool) -> None:
    if dry_run:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def write_text_atomic(path: Path, text: str, *, dry_run: bool) -> None:
    if dry_run:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def ensure_json_object(path: Path, default: dict[str, Any], actions: list[dict[str, Any]], *, dry_run: bool) -> None:
    if path.exists():
        try:
            value = read_json(path, default)
        except Exception as exc:  # noqa: BLE001
            raise InitError(f"{path} is not valid JSON: {exc}") from exc
        if not isinstance(value, dict):
            raise InitError(f"{path} must contain a JSON object")
        actions.append({"path": str(path), "status": "exists"})
        return
    write_json_atomic(path, default, dry_run=dry_run)
    actions.append({"path": str(path), "status": "would_create" if dry_run else "created"})


def ensure_empty_text(path: Path, actions: list[dict[str, Any]], *, dry_run: bool) -> None:
    if path.exists():
        actions.append({"path": str(path), "status": "exists"})
        return
    write_text_atomic(path, "", dry_run=dry_run)
    actions.append({"path": str(path), "status": "would_create" if dry_run else "created"})


def ensure_knowledge_layout(knowledge_dir: Path, actions: list[dict[str, Any]], *, dry_run: bool) -> None:
    canonical_dir = knowledge_dir / "canonical"
    if canonical_dir.exists():
        actions.append({"path": str(canonical_dir), "status": "exists"})
    else:
        if not dry_run:
            canonical_dir.mkdir(parents=True, exist_ok=True)
        actions.append({"path": str(canonical_dir), "status": "would_create" if dry_run else "created"})

    defaults = {
        "distill_stage1.json": {},
        "pending.json": {},
        "duplicates.json": {},
        "rejected.json": {},
        "history.json": {"last_run_at": None, "sessions": {}},
        "review_state.json": {"version": 1, "items": {}},
    }
    for name, default in defaults.items():
        ensure_json_object(knowledge_dir / name, default, actions, dry_run=dry_run)

    ensure_empty_text(knowledge_dir / "review_log.jsonl", actions, dry_run=dry_run)

    whitelist = knowledge_dir / "whitelist.yaml"
    if whitelist.exists():
        actions.append({"path": str(whitelist), "status": "exists"})
    else:
        text = "domains:\n" + "".join(f"  - {domain}\n" for domain in DEFAULT_DOMAINS)
        write_text_atomic(whitelist, text, dry_run=dry_run)
        actions.append({"path": str(whitelist), "status": "would_create" if dry_run else "created"})


def run_command(args: list[str], *, cwd: Path) -> dict[str, Any]:
    result = subprocess.run(
        args,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return {
        "cmd": args,
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
    }


def rebuild_index(workspace: Path, knowledge_dir: Path, *, dry_run: bool) -> dict[str, Any]:
    script = workspace / ".agents" / "skills" / "review" / "scripts" / "build_agent_index.js"
    if not script.exists():
        return {"status": "skipped", "reason": "review index script missing", "path": str(script)}
    if not shutil.which("node"):
        return {"status": "skipped", "reason": "node not found"}
    if dry_run:
        return {"status": "would_run", "cmd": ["node", str(script), "--knowledge-dir", str(knowledge_dir)]}
    result = run_command(["node", str(script), "--knowledge-dir", str(knowledge_dir)], cwd=workspace)
    if result["returncode"] != 0:
        raise InitError(f"index rebuild failed: {result['stderr'] or result['stdout']}")
    return {"status": "rebuilt", "result": parse_json_output(result)}


def parse_json_output(result: dict[str, Any]) -> Any:
    stdout = str(result.get("stdout") or "")
    if not stdout:
        return None
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return stdout


def check_review_frontend(
    workspace: Path,
    knowledge_dir: Path,
    *,
    install_deps: bool,
    build_ui: bool,
    dry_run: bool,
) -> dict[str, Any]:
    review_dir = workspace / ".agents" / "skills" / "review"
    package_json = review_dir / "package.json"
    package_lock = review_dir / "package-lock.json"
    node_modules = review_dir / "node_modules"
    public_index = review_dir / "public" / "index.html"
    server = review_dir / "scripts" / "review_server.js"

    out: dict[str, Any] = {
        "review_dir": str(review_dir),
        "package_json": package_json.exists(),
        "package_lock": package_lock.exists(),
        "node_modules": node_modules.exists(),
        "public_index": public_index.exists(),
        "node": shutil.which("node") is not None,
        "npm": shutil.which("npm") is not None,
        "steps": [],
    }

    if not review_dir.exists():
        out["status"] = "skipped"
        out["reason"] = "review skill missing"
        return out
    if not package_json.exists():
        out["status"] = "incomplete"
        out["reason"] = "package.json missing"
        return out

    if install_deps and not dry_run:
        if not shutil.which("npm"):
            raise InitError("npm is required to install review dependencies")
        install_cmd = ["npm", "ci"] if package_lock.exists() else ["npm", "install"]
        result = run_command(install_cmd, cwd=review_dir)
        out["steps"].append({"name": "install_review_deps", **result})
        if result["returncode"] != 0:
            raise InitError(f"review dependency install failed: {result['stderr'] or result['stdout']}")
        out["node_modules"] = node_modules.exists()
    elif install_deps and dry_run:
        out["steps"].append({"name": "install_review_deps", "status": "would_run"})

    needs_build = build_ui or not public_index.exists()
    if needs_build and not dry_run:
        if not shutil.which("npm"):
            raise InitError("npm is required to build review UI")
        if not node_modules.exists():
            out["steps"].append({"name": "build_review_ui", "status": "skipped", "reason": "node_modules missing"})
        else:
            result = run_command(["npm", "run", "build"], cwd=review_dir)
            out["steps"].append({"name": "build_review_ui", **result})
            if result["returncode"] != 0:
                raise InitError(f"review UI build failed: {result['stderr'] or result['stdout']}")
            out["public_index"] = public_index.exists()
    elif needs_build and dry_run:
        out["steps"].append({"name": "build_review_ui", "status": "would_run"})

    if server.exists() and shutil.which("node") and not dry_run:
        result = run_command(
            ["node", str(server), "--knowledge-dir", str(knowledge_dir), "--check"],
            cwd=workspace,
        )
        out["steps"].append({"name": "review_server_check", **result})
        if result["returncode"] != 0:
            raise InitError(f"review server check failed: {result['stderr'] or result['stdout']}")
    elif dry_run:
        out["steps"].append({"name": "review_server_check", "status": "would_run"})
    else:
        out["steps"].append({"name": "review_server_check", "status": "skipped", "reason": "node or server missing"})

    out["status"] = "ok"
    out["node_modules"] = node_modules.exists()
    out["public_index"] = public_index.exists()
    return out


def build_guide() -> list[str]:
    return [
        "日常入口通常是 distill：选择 Claude Code 或 Codex 主会话，抽取新候选。",
        "distill 之后接 merge：和 canonical 对比，写入 pending 或 duplicates。",
        "做人审时用 review：打开本地 UI，接受、拒绝或编辑 pending 条目。",
        "Agent 需要已审核知识时用 retrieve：先查索引，再按 id 读取具体条目。",
        "Luke 要复习已审核知识时用 recall：它只写复习状态，不改知识正文。",
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", default=".", help="workspace root that contains .agents/skills")
    parser.add_argument("--knowledge-dir", help="knowledge directory; defaults to <workspace>/knowledge")
    parser.add_argument("--dry-run", action="store_true", help="report intended changes without writing files")
    parser.add_argument("--skip-index", action="store_true", help="do not rebuild agent_index.md or agent_views")
    parser.add_argument("--skip-review-check", action="store_true", help="do not check the review frontend/server")
    parser.add_argument("--install-review-deps", action="store_true", help="run npm ci/install in the review skill")
    parser.add_argument("--build-review-ui", action="store_true", help="run npm run build in the review skill")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    workspace = Path(args.workspace).expanduser().resolve()
    knowledge_dir = Path(args.knowledge_dir).expanduser().resolve() if args.knowledge_dir else workspace / "knowledge"
    actions: list[dict[str, Any]] = []

    ensure_knowledge_layout(knowledge_dir, actions, dry_run=args.dry_run)

    index_result = {"status": "skipped", "reason": "--skip-index"}
    if not args.skip_index:
        index_result = rebuild_index(workspace, knowledge_dir, dry_run=args.dry_run)

    review_result = {"status": "skipped", "reason": "--skip-review-check"}
    if not args.skip_review_check:
        review_result = check_review_frontend(
            workspace,
            knowledge_dir,
            install_deps=args.install_review_deps,
            build_ui=args.build_review_ui,
            dry_run=args.dry_run,
        )

    emit(
        {
            "ok": True,
            "workspace": str(workspace),
            "knowledge_dir": str(knowledge_dir),
            "dry_run": args.dry_run,
            "actions": actions,
            "index": index_result,
            "review": review_result,
            "guide": build_guide(),
        }
    )


if __name__ == "__main__":
    try:
        main()
    except InitError as exc:
        sys.stderr.write(f"ERROR: {exc}\n")
        sys.exit(1)
