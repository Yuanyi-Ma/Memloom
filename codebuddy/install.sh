#!/usr/bin/env bash
set -euo pipefail

# 忆织 (Memloom) WorkBuddy/CodeBuddy 安装脚本
# 将忆织注册为 WorkBuddy 的插件

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEBUDDY_DIR="$SCRIPT_DIR"
ROOT_DIR="$(dirname "$CODEBUDDY_DIR")"
SERVER_DIR="$ROOT_DIR/server"
OPENCLAW_DIR="$HOME/.openclaw"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
WORKBUDDY_DIR="$HOME/.workbuddy"
WORKBUDDY_SETTINGS="$WORKBUDDY_DIR/settings.json"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo "🧶 忆织 (Memloom) — WorkBuddy 安装"
echo "================================"
echo ""

# ── 检查环境 ──────────────────────────────────────
echo "▸ 检查环境..."

if [ ! -d "$WORKBUDDY_DIR" ]; then
  fail "未找到 WorkBuddy 配置目录 ($WORKBUDDY_DIR)。请先安装并启动 WorkBuddy。"
fi
info "WorkBuddy 配置目录: $WORKBUDDY_DIR"

if [ ! -d "$OPENCLAW_DIR" ] || [ ! -f "$OPENCLAW_CONFIG" ]; then
  fail "未找到 OpenClaw 配置 ($OPENCLAW_CONFIG)。请先启动一次 WorkBuddy。"
fi
info "OpenClaw 配置: $OPENCLAW_CONFIG"

# ── 构建项目（如需要）─────────────────────────────
echo ""
echo "▸ 检查构建产物..."

if [ -d "$ROOT_DIR/server/dist" ] && [ -d "$ROOT_DIR/web/dist" ]; then
  info "检测到预编译产物，跳过构建"
else
  echo "正在构建项目..."
  bash "$ROOT_DIR/scripts/build.sh"
fi

# ── 注册插件到 OpenClaw ──────────────────────────
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

  if (!config.plugins.allow.includes('memloom')) {
    config.plugins.allow.push('memloom');
  }

  fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(config, null, 2) + '\n');
  console.log('插件路径已注册: $PLUGIN_PATH');
" && info "OpenClaw 插件注册完成"

# ── 启用 WorkBuddy 插件 ──────────────────────────
echo ""
echo "▸ 启用 WorkBuddy 插件..."

if [ -f "$WORKBUDDY_SETTINGS" ]; then
  node -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$WORKBUDDY_SETTINGS', 'utf-8'));
    if (!settings.enabledPlugins) settings.enabledPlugins = {};
    settings.enabledPlugins['memloom'] = true;
    fs.writeFileSync('$WORKBUDDY_SETTINGS', JSON.stringify(settings, null, 2));
    console.log('已在 WorkBuddy settings.json 中启用 memloom');
  " && info "WorkBuddy 插件已启用"
else
  warn "未找到 $WORKBUDDY_SETTINGS，请手动在 WorkBuddy 中启用忆织插件"
fi

# ── 安装 Skills ──────────────────────────────────
echo ""
echo "▸ 安装 Skills..."

SKILLS_DIR="$OPENCLAW_DIR/skills"
mkdir -p "$SKILLS_DIR"
SKILL_NAMES=("kb-active-capture" "kb-file-import" "kb-feynman-review")

for skill in "${SKILL_NAMES[@]}"; do
  # 使用 codebuddy 版的 Skills（HTTP API 版）
  SRC_SKILL="$CODEBUDDY_DIR/skills/$skill"
  DST_SKILL="$SKILLS_DIR/$skill"

  if [ ! -d "$SRC_SKILL" ]; then
    warn "Skill 目录不存在: $SRC_SKILL，跳过"
    continue
  fi

  ln -sfn "$SRC_SKILL" "$DST_SKILL"
  info "$skill → $DST_SKILL"
done

# ── 数据目录 ─────────────────────────────────────
echo ""
echo "▸ 初始化数据目录..."

MEMLOOM_DATA="$HOME/.memloom"
mkdir -p "$MEMLOOM_DATA/db"
info "数据目录已就绪: $MEMLOOM_DATA"

# ── 完成 ─────────────────────────────────────────
echo ""
echo "================================"
info "安装完成！"
echo ""
echo -e "${YELLOW}⚠️  请重启 WorkBuddy 以加载忆织插件${NC}"
echo "  方法：退出 WorkBuddy → 重新打开"
echo ""
echo "使用方式："
echo "  1. 确保 WorkBuddy 已启动"
echo "  2. 访问 http://127.0.0.1:3000"
echo ""
