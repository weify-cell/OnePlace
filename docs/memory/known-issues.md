# 已知问题

> 记录未解决的 Bug、技术债、待优化项。
> 状态标记：[未解决] / [已解决] / [已接受（不修复）]

---

## BUG-008 [已解决]
**文件**：`src/views/tools/TextDiffToolView.vue`
**描述**：文本比较工具 v1.7 的 AC2（300ms 防抖自动更新）功能失效。完成比较后，修改任意输入框内容，高亮不会在300ms防抖后自动更新。必须手动点击"比较"按钮才能看到更新后的结果。
**修复方式**：将 `watchEffect(() => debouncedCompare())` 改为 `watch([originalText, compareText], () => { debouncedCompare() }, { immediate: true })`。`watch` 显式追踪响应式 ref，避免了 `watchEffect` 无法追踪 debouncedCompare 内部依赖的问题。
**回归验收**：2026-03-29 - 测试使用 AAA vs BBB (1+1) → 改为 AAA vs AAA (0+0)，500ms 后统计自动更新为 0+0

---

## BUG-006 [已解决]
**文件**：`src/views/ToolboxView.vue`、`src/views/tools/JsonToolView.vue`、`src/views/tools/ImageBase64ToolView.vue`
**描述**：百宝箱模块三处问题：① 点击百宝箱菜单后左侧菜单消失（路由或布局问题）；② 主题颜色与其他模块不一致（dark/light 模式切换异常）；③ "JSON格式化"和"图片Base64"按钮存在抖动效果（过渡动画问题）。
**修复方式**：添加 AppLayout 包裹使页面正确嵌套在带侧边栏的布局中；统一使用 `dark:text-white`、`dark:bg-gray-800` 等主题变量；将 `v-if/v-else` 切换改为 `max-width+opacity` 过渡。
**回归验收**：2026-03-29

---

## BUG-004 [已解决]
**文件**：`src/App.vue`、`src/views/SettingsView.vue`
**描述**：主题切换三处问题：① `system` 模式返回 `null` 不跟随 OS；② 未在 `<html>` 上写 `dark` class，Tailwind `dark:` 样式不生效；③ `loadSettings()` 仅在 SettingsView 调用，其他页面刷新后主题重置；④ 设置页无即时预览，需保存才生效。
**修复方式**：App.vue 增加 OS 媒体查询 + `watch(isDark)` 同步 `document.documentElement.classList` + `onMounted` 调用 `loadSettings()`；SettingsView 增加 `watch(theme)` 即时同步 store。
**回归验收**：2026-03-22

---

## BUG-005 [已解决]
**文件**：`server/src/services/chat.service.ts:105-107`
**描述**：`streamChat` 构建历史消息时，先用 `.filter` 过滤空内容（已移除 assistant 占位消息），再用 `.slice(0, -1)` 又删掉最后一条（用户消息），导致首次对话 messages 数组为空，AI 接口返回 "400 Empty input messages"。
**修复方式**：删除 `.slice(0, -1)`，仅依赖 filter 排除空内容占位消息。
**回归验收**：2026-03-23

---

## BUG-001 [已解决]
**文件**：`server/src/services/notes.service.ts:49`
**描述**：`extractText` 函数中 `node.content.forEach(traverse)` 的回调参数类型错误。`node.content` 类型为 `unknown[]`，forEach 回调接收 `unknown`，但 `traverse` 参数类型为 `{ text?: string; content?: unknown[] }`，导致 tsc 报错 TS2345。
**修复方式**：改为 `node.content.forEach(child => traverse(child as { text?: string; content?: unknown[] }))`
**回归验收**：2026-03-21，`cd server && npm run typecheck` 通过

---

## BUG-002 [已解决]
**文件**：`server/src/controllers/settings.controller.ts:14,22`
**描述**：`req.params.key` 类型为 `string | string[]`，但 `settingsService.getSetting` / `setSetting` 参数期望 `string`，导致 TS2345。非本迭代引入，预存问题。
**修复方式**：改为 `const key = req.params.key as string`
**回归验收**：2026-03-21，`cd server && npm run typecheck` 通过

---

## BUG-003 [已解决]
**文件**：`src/components/common/AppSidebar.vue:134`
**描述**：文件夹列表区域使用 `<template v-if>` 控制显示，等同于 DOM 移除，不满足项目规范要求的 max-height+opacity 过渡动画。
**修复方式**：改用 CSS `max-height` / `opacity` + `transition-all duration-300` 控制显示隐藏
**回归验收**：2026-03-21，代码审查通过，div 行 136 使用 `(!collapsed && isNotesActive) ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'`

---

## BUG-007 [已解决]
**文件**：`src/utils/text-diff.ts:1,46,49`
**描述**：`diffChars` 导入（来自 `diff` 库函数）与 `computeDiff` 函数内部局部变量 `let diffChars = 0` 同名遮蔽，导致第 46 行 `diffChars(original, compare)` 调用实际调用数字 `0`，触发 `TypeError: Cannot access 'diffChars2' before initialization`。文本比较工具完全不可用。
**修复方式**：将第 49 行的 `let diffChars = 0` 改为 `let diffCharCount = 0`，并同步修改第 55 行和第 66 行的引用。
**回归验收**：2026-03-29 — 已通过完整功能测试

---

## BUG-009 [已接受（暂不修复）]
**文件**：`src/utils/text-diff.ts`
**描述**：文本比较工具 v1.7 使用逐行索引比较算法（按行号一一对齐），而非传统的最长公共子序列（LCS）diff。当原文和对比文行数不同但内容有重叠时，统计数字可能不直观。
**示例**：`"111\n22"` vs `"22"` 比较时，会显示"删除2处，新增1处"。但实际上 `"22"` 在原文的 Line 1 也存在，视觉上只有 "111" 被删除。
**原因**：逐行索引比较强制按行号对齐，不允许内容跨行匹配。
**状态说明**：不影响核心功能（显示是正确的），仅统计数字可能让用户困惑。暂不修改算法，待后续迭代优化。
**记录时间**：2026-04-01

---

## NOTE-001 [已接受]
**文件**：`docs/handoff/frontend-output.md`
**描述**：frontend-output.md 仍记录 v1.4 内容，v1.5 前端开发工作（合并单元格、多 Sheet 选择）未在 handoff 文件中体现。但实际代码实现已包含 v1.5 功能。
**状态说明**：代码实现已完成且通过测试，仅文档未更新。不影响功能。
