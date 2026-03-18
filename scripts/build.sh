#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo "🔨 忆织 (Memloom) 构建脚本"
echo "========================="
echo ""

# ── 环境检查 ────────────────────────
command -v node  >/dev/null 2>&1 || fail "需要 Node.js，请先安装: https://nodejs.org"
command -v npm   >/dev/null 2>&1 || fail "需要 npm"

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || fail "Node.js 版本需 ≥ 18（当前: $(node -v)）"
info "Node $(node -v), npm $(npm -v)"

# ── 构建后端 ────────────────────────
echo ""
echo "▸ 构建后端 (server)..."

cd "$ROOT_DIR/server"
npm install
info "后端依赖安装完成"

./node_modules/.bin/tsc 2>&1 || fail "后端 TypeScript 构建失败"
info "后端构建完成 → server/dist/"

# ── 构建前端 ────────────────────────
echo ""
echo "▸ 构建前端 (web)..."

cd "$ROOT_DIR/web"
npm install
info "前端依赖安装完成"

npm run build 2>&1 || fail "前端 Vite 构建失败"
info "前端构建完成 → web/dist/"

# ── 完成 ────────────────────────────
echo ""
echo "========================="
info "构建完成！"
echo ""
echo "产物位置："
echo "  后端: $ROOT_DIR/server/dist/"
echo "  前端: $ROOT_DIR/web/dist/"
echo ""
