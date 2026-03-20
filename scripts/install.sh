#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$ROOT_DIR/server"
OPENCLAW_DIR="$HOME/.openclaw"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
SKILLS_DIR="$OPENCLAW_DIR/skills"
MEMLOOM_DATA="$HOME/.memloom"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; DIM='\033[2m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()  { echo -e "\n${GREEN}▸${NC} $1"; }
detail(){ echo -e "  ${DIM}$1${NC}"; }

SECONDS=0

echo "🧶 忆织 (Memloom) 安装脚本"
echo "================================"
echo ""

# ── Step 1: 环境检查 ──────────────────────────────
step "检查运行环境"

command -v node  >/dev/null 2>&1 || fail "需要 Node.js，请先安装: https://nodejs.org"
command -v npm   >/dev/null 2>&1 || fail "需要 npm"

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || fail "Node.js 版本需 ≥ 18（当前: $(node -v)）"
info "Node $(node -v), npm $(npm -v)"
detail "node 路径: $(which node)"
detail "npm  路径: $(which npm)"
detail "系统: $(uname -s) $(uname -m)"

if [ ! -d "$OPENCLAW_DIR" ] || [ ! -f "$OPENCLAW_CONFIG" ]; then
  fail "未找到 OpenClaw 配置（$OPENCLAW_CONFIG）。请先启动一次 OpenClaw。"
fi
info "OpenClaw 配置: $OPENCLAW_DIR"
detail "配置文件大小: $(wc -c < "$OPENCLAW_CONFIG" | tr -d ' ') bytes"

# ── Step 2: 构建项目 ─────────────────────────────
step "检查构建产物"

if [ -d "$ROOT_DIR/server/dist" ] && [ -d "$ROOT_DIR/web/dist" ]; then
  info "检测到预编译产物，跳过构建"
  detail "后端产物: $(find "$ROOT_DIR/server/dist" -type f 2>/dev/null | wc -l | tr -d ' ') 个文件"
  detail "前端产物: $(find "$ROOT_DIR/web/dist" -type f 2>/dev/null | wc -l | tr -d ' ') 个文件"
else
  detail "未找到预编译产物，开始构建..."
  bash "$SCRIPT_DIR/build.sh"
fi

# ── Step 3: 注册插件到 OpenClaw ──────────────────
step "注册插件"

cp "$OPENCLAW_CONFIG" "${OPENCLAW_CONFIG}.bak"
info "已备份配置 → ${OPENCLAW_CONFIG}.bak"

PLUGIN_PATH="$SERVER_DIR"
detail "插件路径: $PLUGIN_PATH"

# 检查 server 目录下核心文件存在
if [ ! -f "$PLUGIN_PATH/dist/index.js" ] && [ ! -f "$PLUGIN_PATH/index.ts" ]; then
  warn "未在插件目录找到 dist/index.js 或 index.ts，插件可能无法加载"
  detail "目录内容: $(ls "$PLUGIN_PATH"/ 2>/dev/null | head -10)"
fi

node -e "
  const fs = require('fs');
  const config = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf-8'));

  if (!config.plugins) config.plugins = {};
  if (!config.plugins.load) config.plugins.load = {};
  if (!config.plugins.load.paths) config.plugins.load.paths = [];
  if (!config.plugins.allow) config.plugins.allow = [];

  const before = config.plugins.load.paths.length;
  config.plugins.load.paths = config.plugins.load.paths.filter(
    p => !p.includes('memloom') && !p.includes('Memloom')
  );
  config.plugins.load.paths.push('$PLUGIN_PATH');
  console.log('  插件路径已注册: $PLUGIN_PATH');
  console.log('  已有插件数: ' + config.plugins.load.paths.length + ' (之前: ' + before + ')');

  if (!config.plugins.allow.includes('memloom')) {
    config.plugins.allow.push('memloom');
    console.log('  已添加到 allow 列表');
  } else {
    console.log('  already in allow 列表');
  }

  fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(config, null, 2) + '\n');
" && info "插件注册完成"

# ── Step 4: 安装 Skills ──────────────────────────
step "安装 Skills"

mkdir -p "$SKILLS_DIR"
detail "Skills 目录: $SKILLS_DIR"

SKILL_NAMES=("kb-active-capture" "kb-file-import" "kb-feynman-review")

for skill in "${SKILL_NAMES[@]}"; do
  SRC_SKILL="$ROOT_DIR/skills/$skill"
  DST_SKILL="$SKILLS_DIR/$skill"

  if [ ! -d "$SRC_SKILL" ]; then
    warn "Skill 源目录不存在: $SRC_SKILL，跳过"
    continue
  fi

  # 检查 SKILL.md 是否存在
  if [ ! -f "$SRC_SKILL/SKILL.md" ]; then
    warn "$skill 缺少 SKILL.md 文件"
  fi

  ln -sfn "$SRC_SKILL" "$DST_SKILL"
  info "$skill → $DST_SKILL"

  # 验证链接是否生效
  if [ -L "$DST_SKILL" ] && [ -d "$DST_SKILL" ]; then
    detail "符号链接已生效"
  else
    warn "$skill 符号链接可能未正确创建"
    detail "ls -la: $(ls -la "$DST_SKILL" 2>&1)"
  fi
done

# 展示最终 skills 目录状态
detail "Skills 目录最终状态:"
ls -la "$SKILLS_DIR"/ 2>/dev/null | while read line; do
  detail "  $line"
done

# ── Step 5: 数据目录 ─────────────────────────────
step "初始化数据目录"

mkdir -p "$MEMLOOM_DATA/db"
info "数据目录已就绪: $MEMLOOM_DATA"

# 展示数据目录内容
detail "目录内容:"
ls -la "$MEMLOOM_DATA"/ 2>/dev/null | while read line; do
  detail "  $line"
done

# 检查配置文件
if [ -f "$MEMLOOM_DATA/config.json" ]; then
  info "已有配置文件 config.json"
  detail "分类: $(node -e "const c=JSON.parse(require('fs').readFileSync('$MEMLOOM_DATA/config.json','utf-8'));console.log((c.categories||[]).join(', '))" 2>/dev/null || echo '读取失败')"
else
  detail "首次安装，将使用默认配置"
fi

# ── Step 6: 重启 Gateway ─────────────────────────
step "重启 Gateway"

# 杀掉现有 Gateway 进程，launchd 会自动重启
if lsof -ti :18789 >/dev/null 2>&1; then
  GATEWAY_PID=$(lsof -ti :18789 | head -1)
  detail "发现 Gateway 进程 (PID: $GATEWAY_PID)，正在重启..."
  kill $(lsof -ti :18789) 2>/dev/null || true
  detail "等待 Gateway 自动重启 (4 秒)..."
  sleep 4
  if lsof -ti :18789 >/dev/null 2>&1; then
    NEW_PID=$(lsof -ti :18789 | head -1)
    info "Gateway 已重启 (新 PID: $NEW_PID)"
  else
    warn "Gateway 未自动重启，请手动重启 OpenClaw"
    detail "尝试: 关闭并重新打开 OpenClaw 应用"
  fi
else
  warn "Gateway 未在运行（端口 18789 无进程），请启动 OpenClaw"
fi

# ── 完成 ─────────────────────────────────────────
echo ""
echo "================================"
info "安装完成！（用时 ${SECONDS} 秒）"
echo ""
echo -e "${YELLOW}⚠️  请勿移动本项目目录，否则插件路径会失效。${NC}"
echo ""
echo "使用方式："
echo "  1. 确保 OpenClaw 已启动"
echo "  2. 访问 http://127.0.0.1:3000"
echo ""
echo "排查问题："
echo "  日志: ~/.openclaw/logs/"
echo "  配置: $OPENCLAW_CONFIG"
echo "  数据: $MEMLOOM_DATA"
echo ""
