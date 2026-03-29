# 迭代归档索引

> 每次迭代完成后在此追加记录，不删除历史条目。 详细 handoff 文件见各迭代目录。

------

## v1.6 | 百宝箱 - 文本比较工具 | 2026-03-29

- 主要功能：逐字符 diff 差异化比较（类似 VS Code diff）、差异导航（scrollIntoView）、大文本警告/拒绝机制、纯文本差异报告复制
- 目录：docs/archive/v1.6-toolbox-text-diff/
- 结论：全部功能验收通过，Bug-007 已修复，0 控制台错误
- 新增：TextDiffToolView.vue、DiffResultPanel.vue、text-diff.ts

---

## v1.5 | 百宝箱 - Excel/JSON 格式转换 v2 | 2026-03-29

- 主要功能：合并单元格展开（垂直/水平）、多 Sheet 复选框选择、单/多 Sheet 输出格式自适应
- 目录：docs/archive/v1.5-toolbox-excel-json-v2/
- 结论：31 个单元测试通过，类型检查通过，验收通过
- 新增：SheetSelectorDialog.vue 组件、parseWorksheetWithMerges 合并单元格算法

---

## v1.4 | 百宝箱 - Excel/JSON 双向转换 | 2026-03-29

- 主要功能：Excel 导入转 JSON、JSON 导出 Excel、多 Sheet 支持、拖拽上传、文件类型检测
- 目录：docs/archive/v1.4-excel-json/
- 结论：全部功能开发完成，验收通过

---

## v1.3 | 百宝箱模块 - 开发工具集 | 2026-03-29

- 主要功能：JSON 格式化工具（格式化、压缩、验证、转义）、图片 Base64 互转（拖拽、粘贴、预览、下载）、纯前端实现无后端依赖
- 目录：docs/archive/v1.3-toolbox/
- 结论：全部功能开发完成，3 个 bug 已修复（侧边栏消失、主题颜色不一致、按钮抖动），验收通过
- 补丁：百宝箱模块 UI 问题修复，已于 2026-03-29 完成

---

## v1.2 | 笔记文件夹 + 标签系统 | 2026-03-21

- 主要功能：笔记文件夹 CRUD、笔记归属 folder_id、侧边栏文件夹筛选、标签增删与筛选（json_each）
- 目录：docs/archive/v1.2-notes-folder-tag/
- 结论：全部 7 项 AC 通过，3 个 bug 已修复，验收通过
- 补丁：主题切换 bug（`dark` class 未同步 + `loadSettings` 仅在 Settings 页调用 + 无即时预览），已于 2026-03-22 修复
- 补丁：对话首次发送报 "400 Empty input messages"（`chat.service.ts` `.slice(0,-1)` 误删用户消息），已于 2026-03-23 修复

---

## v1.1 | 待办事项编辑功能 | 2026-03-21

- 主要功能：TodoEditModal 弹窗编辑（7字段预填）、TodoItem 悬停编辑入口、乐观更新+回滚、快捷状态切换
- 目录：docs/archive/v1.1-todo-edit/
- 结论：全部 5 项 AC 通过，无 bug，验收通过