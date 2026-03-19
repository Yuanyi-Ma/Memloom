# 忆织 × WorkBuddy / CodeBuddy 适配

本目录包含忆织在 WorkBuddy（又名 CodeBuddy）上运行所需的全部适配文件。

## 与标准 OpenClaw 版本的区别

标准版忆织通过 OpenClaw Gateway 的 `registerTool` API 注册工具（如 `kb_save_card`），Agent 直接调用 Tool。

WorkBuddy 的 Agent 使用不同的工具发现机制，因此本目录中的 Skills 改为通过 **HTTP API**（`curl`）与忆织后端通信，无需依赖 Gateway Tool 注册。

## 目录结构

```
codebuddy/
├── .codebuddy-plugin/
│   └── plugin.json        ← WorkBuddy 插件元信息
├── skills/
│   ├── kb-active-capture/  ← 对话知识提取（HTTP API 版）
│   ├── kb-feynman-review/  ← 费曼复习（HTTP API 版）
│   └── kb-file-import/     ← 文件知识导入（HTTP API 版）
├── install.sh              ← WorkBuddy 专用安装脚本
└── README.md               ← 本文件
```

## 安装

```bash
bash codebuddy/install.sh
```

安装脚本会自动：
1. 注册忆织插件到 OpenClaw 配置
2. 在 WorkBuddy `settings.json` 中启用插件
3. 安装 HTTP API 版的 Skills（替代标准版的 Gateway Tool 版）
4. 提示重启 WorkBuddy
