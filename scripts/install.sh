#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$ROOT_DIR/server"
OPENCLAW_DIR="$HOME/.openclaw"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
SKILLS_DIR="$OPENCLAW_DIR/skills"
MEMLOOM_DATA="$HOME/.memloom"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo "🧶 忆织 (Memloom) 安装脚本"
echo "================================"
echo ""

# ── Step 1: 环境检查 ──────────────────────────────
echo "▸ 检查运行环境..."

command -v node  >/dev/null 2>&1 || fail "需要 Node.js，请先安装: https://nodejs.org"
command -v npm   >/dev/null 2>&1 || fail "需要 npm"

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || fail "Node.js 版本需 ≥ 18（当前: $(node -v)）"
info "Node $(node -v), npm $(npm -v)"

if [ ! -d "$OPENCLAW_DIR" ] || [ ! -f "$OPENCLAW_CONFIG" ]; then
  fail "未找到 OpenClaw 配置（$OPENCLAW_CONFIG）。请先启动一次 OpenClaw。"
fi
info "OpenClaw 配置: $OPENCLAW_DIR"

# ── Step 2: 构建项目 ─────────────────────────────
echo ""
echo "▸ 检查构建产物..."

if [ -d "$ROOT_DIR/server/dist" ] && [ -d "$ROOT_DIR/web/dist" ]; then
  info "检测到预编译产物，跳过构建"
else
  echo "正在构建项目..."
  bash "$SCRIPT_DIR/build.sh"
fi

# ── Step 3: 注册插件到 OpenClaw ──────────────────
echo ""
echo "▸ 注册插件..."

cp "$OPENCLAW_CONFIG" "${OPENCLAW_CONFIG}.bak"
info "已备份配置 → ${OPENCLAW_CONFIG}.bak"

PLUGIN_PATH="$SERVER_DIR"

node -e "
  const fs = require('fs');
  const config = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf-8'));

  if (!config.plugins) config.plugins = {};
  if (!config.plugins.load) config.plugins.load = {};
  if (!config.plugins.load.paths) config.plugins.load.paths = [];
  if (!config.plugins.allow) config.plugins.allow = [];

  config.plugins.load.paths = config.plugins.load.paths.filter(
    p => !p.includes('memloom') && !p.includes('Memloom')
  );
  config.plugins.load.paths.push('$PLUGIN_PATH');
  console.log('插件路径已注册: $PLUGIN_PATH');

  if (!config.plugins.allow.includes('memloom')) {
    config.plugins.allow.push('memloom');
  }

  fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(config, null, 2) + '\n');
" && info "插件注册完成"

# ── Step 4: 安装 Skills ──────────────────────────
echo ""
echo "▸ 安装 Skills..."

mkdir -p "$SKILLS_DIR"
SKILL_NAMES=("kb-active-capture" "kb-file-import" "kb-feynman-review")

for skill in "${SKILL_NAMES[@]}"; do
  SRC_SKILL="$ROOT_DIR/skills/$skill"
  DST_SKILL="$SKILLS_DIR/$skill"

  if [ ! -d "$SRC_SKILL" ]; then
    warn "Skill 目录不存在: $SRC_SKILL，跳过"
    continue
  fi

  ln -sfn "$SRC_SKILL" "$DST_SKILL"
  info "$skill → $DST_SKILL"
done

# ── Step 5: 数据目录 ─────────────────────────────
echo ""
echo "▸ 初始化数据目录..."

mkdir -p "$MEMLOOM_DATA/db"
info "数据目录已就绪: $MEMLOOM_DATA"

# ── Step 6: 重启 Gateway ─────────────────────────
echo ""
echo "▸ 重启 Gateway..."

# 杀掉现有 Gateway 进程，launchd 会自动重启
if lsof -ti :18789 >/dev/null 2>&1; then
  kill $(lsof -ti :18789) 2>/dev/null || true
  sleep 4
  if lsof -ti :18789 >/dev/null 2>&1; then
    info "Gateway 已重启"
  else
    warn "Gateway 未自动重启，请手动重启 OpenClaw"
  fi
else
  warn "Gateway 未在运行，请启动 OpenClaw"
fi

# ── 完成 ─────────────────────────────────────────
echo ""
echo "================================"
info "安装完成！"
echo ""
echo -e "${YELLOW}⚠️  请勿移动本项目目录，否则插件路径会失效。${NC}"
echo ""
echo "使用方式："
echo "  1. 确保 OpenClaw 已启动"
echo "  2. 访问 http://127.0.0.1:3000"
echo ""
