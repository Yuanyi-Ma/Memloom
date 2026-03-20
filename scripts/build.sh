#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()  { echo -e "\n${GREEN}▸${NC} $1"; }
detail(){ echo -e "  ${DIM}$1${NC}"; }

SECONDS=0  # bash 内置计时器

echo "🔨 忆织 (Memloom) 构建脚本"
echo "========================="
echo ""

# ── 环境检查 ────────────────────────
step "检查运行环境"

command -v node  >/dev/null 2>&1 || fail "需要 Node.js，请先安装: https://nodejs.org"
command -v npm   >/dev/null 2>&1 || fail "需要 npm"

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || fail "Node.js 版本需 ≥ 18（当前: $(node -v)）"
info "Node $(node -v), npm $(npm -v)"
detail "node 路径: $(which node)"
detail "npm  路径: $(which npm)"
detail "工作目录:  $ROOT_DIR"

# ── 构建后端 ────────────────────────
step "构建后端 (server)"

cd "$ROOT_DIR/server"
detail "路径: $(pwd)"
detail "运行 npm install ..."

if npm install 2>&1; then
  info "后端依赖安装完成 ($(ls node_modules | wc -l | tr -d ' ') 个包)"
else
  fail "后端 npm install 失败（退出码: $?）"
fi

detail "运行 tsc 编译 ..."
if ./node_modules/.bin/tsc 2>&1; then
  info "后端构建完成 → server/dist/"
  detail "产物文件数: $(find dist -type f 2>/dev/null | wc -l | tr -d ' ')"
else
  fail "后端 TypeScript 构建失败，请检查上方 tsc 错误输出"
fi

# ── 构建前端 ────────────────────────
step "构建前端 (web)"

cd "$ROOT_DIR/web"
detail "路径: $(pwd)"
detail "运行 npm install ..."

if npm install 2>&1; then
  info "前端依赖安装完成 ($(ls node_modules | wc -l | tr -d ' ') 个包)"
else
  fail "前端 npm install 失败（退出码: $?）"
fi

detail "运行 vite build ..."
if npm run build 2>&1; then
  info "前端构建完成 → web/dist/"
  detail "产物文件数: $(find dist -type f 2>/dev/null | wc -l | tr -d ' ')"
  detail "产物总大小: $(du -sh dist 2>/dev/null | cut -f1)"
else
  fail "前端 Vite 构建失败，请检查上方错误输出"
fi

# ── 完成 ────────────────────────────
echo ""
echo "========================="
info "构建完成！（用时 ${SECONDS} 秒）"
echo ""
echo "产物位置："
echo "  后端: $ROOT_DIR/server/dist/"
echo "  前端: $ROOT_DIR/web/dist/"
echo ""
