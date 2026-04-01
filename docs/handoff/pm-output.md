# PM 需求分析 handoff

## 模块信息
- 版本号：v1.8
- 模块名：notes-markdown
- 启动日期：2026-04-01

## 需求结论

将笔记编辑器从 Tiptap 富文本切换为纯 Markdown 编辑器（CodeMirror 6），以原始 Markdown 文本存储，支持图片粘贴/拖拽上传到服务器，实时分屏预览。

## 关键决策

| # | 问题 | 选择 | 说明 |
|---|------|------|------|
| 1 | 存储格式 | A 存储 Markdown 原文 | 便于迁移和内容可读 |
| 2 | 编辑器类型 | A 纯 Markdown 编辑器 | CodeMirror/Monaco，左侧编辑右侧预览分屏 |
| 3 | 图片上传方式 | A 上传到服务器 | 粘贴/拖拽上传到 /api/upload |
| 4 | 工具栏 | C 极简模式 | 无工具栏，纯靠 Markdown 语法，快捷键 |
| 5 | 图片插入语法 | A Markdown 图片语法 | `![](URL)` |
| 6 | 图片路径 | A 相对路径 | `/uploads/xxx.png` |
| 7 | 预览方式 | A 实时渲染 | 编辑时右侧同步预览 |
| 8 | 文件管理 | B 不限制文件大小，历史文件管理 | 支持删除已上传的图片 |

## 功能范围

### 纳入
- CodeMirror 6 Markdown 编辑器（左侧编辑）
- 实时预览分屏（右侧预览，滚动同步）
- 极简模式（无工具栏，键盘快捷键）
- 粘贴/拖拽图片上传到 /api/upload
- Markdown 图片语法插入（相对路径）
- 图片历史管理与删除
- 存量 Tiptap JSON 笔记迁移（首次编辑时转换）
- content_text 同步更新

### 排除
- Tiptap 富文本（保留用于存量笔记展示）
- 文件夹/标签功能
- 导出 PDF/HTML
- 移动端优化
- 上传大小限制和格式过滤

## PRD 路径
`docs/prd/notes-markdown.md`

## 下游状态
- [ ] 架构设计 → 待 architect agent
- [ ] 前端开发 → 待 frontend agent
- [ ] 测试验收 → 待 tester agent
