#!/usr/bin/env bash
set -euo pipefail

OS_TYPE="$(uname -s)"

# ── 还原真实用户 HOME ────────────────────────────
if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then
  REAL_USER="$SUDO_USER"
  if [ "$OS_TYPE" = "Darwin" ]; then
    REAL_HOME=$(dscacheutil -q user -a name "$REAL_USER" | awk '/^dir:/{print $2}')
  else
    REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)
  fi
else
  REAL_USER="$USER"
  REAL_HOME="$HOME"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OPENCLAW_DIR="$REAL_HOME/.openclaw"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
SKILLS_DIR="$OPENCLAW_DIR/skills"
MEMLOOM_DATA="$REAL_HOME/.memloom"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# 跨平台 sed -i
sedi() {
  if [ "$OS_TYPE" = "Darwin" ]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

echo "🧹 忆织 (Memloom) 卸载脚本"
echo "================================"
echo ""

# ── Step 1: 停止 Gateway ─────────────────────────
echo "▸ 停止 OpenClaw Gateway..."

SAVED_PATH_FILE="$ROOT_DIR/.openclaw_path"
if [ -f "$SAVED_PATH_FILE" ]; then
  OPENCLAW_PATH="$(cat "$SAVED_PATH_FILE")"
  if command -v "$OPENCLAW_PATH" >/dev/null 2>&1 || [ -x "$OPENCLAW_PATH" ]; then
    "$OPENCLAW_PATH" gateway stop 2>/dev/null || true
    info "Gateway 已停止"
  else
    warn "OpenClaw 路径无效，跳过 Gateway 停止"
  fi
else
  if command -v openclaw >/dev/null 2>&1; then
    openclaw gateway stop 2>/dev/null || true
    info "Gateway 已停止"
  else
    warn "未找到 OpenClaw，跳过 Gateway 停止"
  fi
fi

# kill 残留的前端进程
pkill -f "vite.*memloom" 2>/dev/null || true

# ── Step 2: 移除 Skills 软链接 ───────────────────
echo ""
echo "▸ 移除 Skills 软链接..."

SKILL_NAMES=("kb-active-capture" "kb-file-import" "kb-feynman-review")
for skill in "${SKILL_NAMES[@]}"; do
  LINK="$SKILLS_DIR/$skill"
  if [ -L "$LINK" ]; then
    rm -f "$LINK"
    info "已移除 $skill"
  else
    warn "$skill 不存在，跳过"
  fi
done

# ── Step 3: 从 OpenClaw 配置移除插件（纯 sed）───
echo ""
echo "▸ 清理 OpenClaw 插件配置..."

if [ -f "$OPENCLAW_CONFIG" ]; then
  # 3a: 从 plugins.allow 移除 "memloom" 行
  if grep -q '"memloom"' "$OPENCLAW_CONFIG"; then
    # 删除包含 "memloom" 的行
    sedi '/"memloom"/d' "$OPENCLAW_CONFIG"
    # 修复可能出现的尾逗号（JSON 不允许 trailing comma）：] 前一行如果以逗号结尾就去掉
    sedi '/,$/{ N; s/,\n\(.*\]\)/\n\1/; }' "$OPENCLAW_CONFIG"
    info "已从 plugins.allow 移除 memloom"
  fi

  # 3b: 从 plugins.load.paths 移除包含 memloom 的路径
  if grep -q 'memloom' "$OPENCLAW_CONFIG"; then
    # 将包含 memloom 路径的 paths 还原为空数组
    sedi 's|"paths": \[.*memloom.*\]|"paths": []|' "$OPENCLAW_CONFIG"
    info "已从 plugins.load.paths 移除 memloom 路径"
  fi
else
  warn "未找到 OpenClaw 配置文件，跳过"
fi

# ── Step 4: 删除 Memloom 数据目录 ────────────────
echo ""
echo "▸ 删除 Memloom 数据目录..."

if [ -d "$MEMLOOM_DATA" ]; then
  rm -rf "$MEMLOOM_DATA"
  info "已删除 $MEMLOOM_DATA"
else
  warn "$MEMLOOM_DATA 不存在，跳过"
fi

# ── Step 5: 清理构建产物 ─────────────────────────
echo ""
echo "▸ 清理构建产物..."

for dir in "$ROOT_DIR/server/dist" "$ROOT_DIR/server/node_modules" \
           "$ROOT_DIR/web/dist" "$ROOT_DIR/web/node_modules"; do
  if [ -d "$dir" ]; then
    rm -rf "$dir"
    info "已删除 $(basename "$(dirname "$dir")")/$(basename "$dir")"
  fi
done

[ -f "$ROOT_DIR/.openclaw_path" ] && rm -f "$ROOT_DIR/.openclaw_path" && info "已删除 .openclaw_path"

echo ""
echo "================================"
info "卸载完成！"
echo ""
echo "注意："
echo "  - 已安装的系统工具未被移除"
echo "  - 项目源码目录未被删除（$ROOT_DIR）"
echo "  - 如需完全删除，请执行: rm -rf $ROOT_DIR"
echo ""
