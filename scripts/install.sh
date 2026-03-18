#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$ROOT_DIR/server"
OPENCLAW_DIR="$HOME/.openclaw"
OPENCLAW_CONFIG="$OPENCLAW_DIR/openclaw.json"
SKILLS_DIR="$OPENCLAW_DIR/skills"

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

if [ ! -d "$OPENCLAW_DIR" ]; then
  fail "未找到 OpenClaw 配置目录 ($OPENCLAW_DIR)。请先安装 OpenClaw: https://docs.openclaw.ai"
fi
if [ ! -f "$OPENCLAW_CONFIG" ]; then
  fail "未找到 OpenClaw 配置文件 ($OPENCLAW_CONFIG)"
fi
info "OpenClaw 配置目录: $OPENCLAW_DIR"

# ── Step 2: 获取 OpenClaw 路径 ───────────────────
echo ""

# 自动探测：如果 openclaw 在 PATH 中，直接使用
if [ -z "${OPENCLAW_PATH:-}" ]; then
  if command -v openclaw >/dev/null 2>&1; then
    OPENCLAW_PATH="$(command -v openclaw)"
    info "自动检测到 OpenClaw: $OPENCLAW_PATH"
  else
    echo "未在 PATH 中找到 openclaw，请输入完整路径"
    echo "（例如: /usr/local/bin/openclaw）"
    echo ""
    read -rp "OpenClaw 路径: " OPENCLAW_PATH
    echo ""
  fi
fi

OPENCLAW_PATH="${OPENCLAW_PATH/#\~/$HOME}"

if command -v "$OPENCLAW_PATH" >/dev/null 2>&1; then
  OPENCLAW_PATH="$(command -v "$OPENCLAW_PATH")"
elif [ -f "$OPENCLAW_PATH" ] && [ -x "$OPENCLAW_PATH" ]; then
  : # 路径有效
else
  fail "找不到 OpenClaw: $OPENCLAW_PATH"
fi
info "OpenClaw 可执行文件: $OPENCLAW_PATH"

# 保存路径供 start.sh 使用
echo "$OPENCLAW_PATH" > "$ROOT_DIR/.openclaw_path"
info "OpenClaw 路径已保存"

# ── Step 3: 构建项目 ─────────────────────────────
echo ""
echo "▸ 构建项目..."

if [ -d "$ROOT_DIR/server/dist" ] && [ -d "$ROOT_DIR/web/dist" ]; then
  info "检测到预编译产物，跳过构建"
else
  bash "$SCRIPT_DIR/build.sh"
fi

# ── Step 4: 注册插件到 OpenClaw ──────────────────
echo ""
echo "▸ 注册插件到 OpenClaw..."

# 备份原始配置
cp "$OPENCLAW_CONFIG" "${OPENCLAW_CONFIG}.bak"
info "已备份 OpenClaw 配置 → ${OPENCLAW_CONFIG}.bak"

PLUGIN_PATH="$SERVER_DIR"

# 定义 Node.js JSON 操作函数（替代 jq，因为 macOS 默认没有 jq）
node_json_add_plugin() {
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$OPENCLAW_CONFIG', 'utf-8'));

    // 确保 plugins 结构存在
    if (!config.plugins) config.plugins = {};
    if (!config.plugins.load) config.plugins.load = {};
    if (!config.plugins.load.paths) config.plugins.load.paths = [];
    if (!config.plugins.allow) config.plugins.allow = [];

    // 先清理旧的 memloom 插件路径（支持重装/移目录后重装）
    const oldLen = config.plugins.load.paths.length;
    config.plugins.load.paths = config.plugins.load.paths.filter(
      p => !p.includes('memloom') && !p.includes('Memloom')
    );
    if (config.plugins.load.paths.length < oldLen) {
      console.log('已清理 ' + (oldLen - config.plugins.load.paths.length) + ' 条旧插件路径');
    }

    // 添加当前插件路径
    const pluginPath = '$PLUGIN_PATH';
    config.plugins.load.paths.push(pluginPath);
    console.log('插件路径已注册: ' + pluginPath);

    // 添加 allow（去重）
    if (!config.plugins.allow.includes('memloom')) {
      config.plugins.allow.push('memloom');
      console.log('已将 memloom 加入 plugins.allow');
    } else {
      console.log('memloom 已在 plugins.allow 中');
    }

    fs.writeFileSync('$OPENCLAW_CONFIG', JSON.stringify(config, null, 2) + '\n');
  "
}

if node_json_add_plugin; then
  info "插件注册完成"
else
  warn "自动注册失败。请手动在 $OPENCLAW_CONFIG 中添加："
  echo ""
  echo "  在 plugins.load.paths 中添加: \"$SERVER_DIR\""
  echo "  在 plugins.allow 中添加: \"memloom\""
fi

# ── Step 5: Skill 软链接 ─────────────────────────
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

# ── Step 6: 数据目录 + 重启 Gateway ──────────────
echo ""
echo "▸ 初始化数据目录..."

MEMLOOM_DATA="$HOME/.memloom"
mkdir -p "$MEMLOOM_DATA/db"
info "数据目录已就绪: $MEMLOOM_DATA"

echo ""
echo "▸ 尝试重启 OpenClaw Gateway..."

if "$OPENCLAW_PATH" gateway stop 2>/dev/null; then
  sleep 1
fi

if "$OPENCLAW_PATH" gateway &>/dev/null &
then
  GATEWAY_PID=$!
  sleep 3
  if kill -0 "$GATEWAY_PID" 2>/dev/null; then
    info "OpenClaw Gateway 已启动 (PID: $GATEWAY_PID)"
  else
    warn "OpenClaw Gateway 启动后退出，请手动启动"
  fi
else
  warn "无法通过脚本启动 Gateway（WSL 等环境可能不支持）"
  echo "  请在 OpenClaw 客户端中手动重启 Gateway"
fi

echo ""
echo "================================"
info "安装完成！"
echo ""
echo -e "${YELLOW}⚠️  重要提示：请勿移动本项目目录，否则插件路径会失效。${NC}"
echo ""
echo "启动服务："
echo "  bash scripts/start.sh"
echo ""
echo "或手动启动："
echo "  1. $OPENCLAW_PATH gateway"
echo "  2. 访问 http://127.0.0.1:3000"
echo ""
