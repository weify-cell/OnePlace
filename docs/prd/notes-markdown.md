# v1.8 笔记 Markdown 富文本编辑 PRD

## 背景与目标

现有笔记使用 Tiptap 富文本编辑器存储 Tiptap JSON 格式，内容可读性差，迁移成本高。本期目标：切换为纯 Markdown 编辑器（CodeMirror 6），以原始 Markdown 文本存储，支持图片粘贴上传和实时预览分离，提升内容可移植性和编辑效率。

---

## 功能清单

### 编辑器核心

- [ ] **Markdown 编辑器**：左侧 CodeMirror 6 编辑器，右侧实时预览，分屏布局
- [ ] **纯 Markdown 语法**：无工具栏，无格式按钮，依赖 Markdown 语法输入，快捷键支持（Ctrl+B 加粗、Ctrl+I 斜体等）
- [ ] **实时渲染预览**：编辑时右侧预览区同步滚动位置（对应行）

### 图片上传

- [ ] **粘贴上传**：在编辑器中 Ctrl+V 粘贴图片，自动上传到 `/api/upload`，返回相对路径 `/uploads/xxx.png`，插入 `![](URL)` 语法
- [ ] **拖拽上传**：将图片文件拖入编辑器区域，触发相同上传流程
- [ ] **图片历史管理**：上传的图片保留在文件系统中；笔记详情页提供"已上传图片"管理区域，支持查看和删除已引用的图片文件（删除后笔记中的图片链接失效需用户手动处理）

### 数据存储

- [ ] **Markdown 原文存储**：笔记 content 字段直接存储 Markdown 原文字符串，不再存储 Tiptap JSON
- [ ] **content_text 同步**：保存时同步更新 content_text（纯文本提取，用于全文搜索）

### 向后兼容

- [ ] **存量笔记迁移**：已有的 Tiptap JSON 格式笔记在首次打开编辑时提示用户，内容可正常显示，保存后转为 Markdown 格式
- [ ] **仅展示模式**：对于未转换为 Markdown 的存量笔记，展示页面继续渲染（前端 Tiptap 渲染展示）

---

## 本期不做

- Tiptap 富文本编辑器保留用于存量笔记展示（不删除）
- 笔记文件夹/标签功能，不在本次范围
- Markdown 导出 PDF/HTML 功能
- 移动端 Markdown 编辑体验优化
- 图片上传大小限制和格式过滤

---

## 验收标准

**AC-M1 新建 Markdown 笔记**
```
Given 用户在笔记列表点击"新建笔记"
When 选择笔记类型为"Markdown 笔记"并进入编辑
Then 左侧显示空白 CodeMirror 编辑器，右侧显示空白预览区
```

**AC-M2 Markdown 语法高亮与预览**
```
Given 用户在 CodeMirror 编辑器输入 "# 标题" 和 "**粗体**"
Then 语法高亮生效；右侧预览区实时渲染为 H1 标题和粗体文字
```

**AC-M3 粘贴图片上传**
```
Given 用户在编辑器中 Ctrl+V 粘贴一张截图
When 图片上传到 /api/upload 成功并返回 /uploads/xxx.png
Then 编辑器中光标处插入 "![](uploads/xxx.png)"
```

**AC-M4 拖拽图片上传**
```
Given 用户将一张 PNG 文件拖入编辑器区域
When 上传成功
Then 编辑器中插入 "![](uploads/xxx.png)"
```

**AC-M5 快捷键支持**
```
Given 用户在编辑器中选中一段文字
When 按 Ctrl+B
Then 选中文字被 **包围，变为粗体
```

**AC-M6 存量 Tiptap 笔记编辑**
```
Given 存在一条 content="{\"type\":\"doc\"...}" 的存量笔记
When 用户首次打开该笔记进行编辑
Then 弹出提示"此笔记为旧格式，首次保存将转为 Markdown"；笔记内容正常展示；保存后 content 变为 Markdown 原文
```

**AC-M7 图片管理**
```
Given 一篇笔记曾上传过 2 张图片
When 用户在笔记编辑页点击"管理已上传图片"
Then 显示该笔记关联的 2 张图片列表，支持删除（物理删除文件）
```

**AC-M8 预览区滚动同步**
```
Given 用户在编辑器中滚动到第 50 行
When 预览区应滚动到与编辑器第 50 行对应的预览位置
Then 两者大致对齐
```

---

## 技术约束

- 编辑器选型：CodeMirror 6（@codemirror/view + @codemirror/state + @codemirror/lang-markdown）
- 预览渲染：marked 或 markdown-it（同步渲染，无 SSE）
- 上传接口：POST /api/upload，FormData 字段名 `file`，返回 `{ url: string }`
- 相对路径前缀：由前端在插入语法时拼合为 `/uploads/xxx.png`
- 数据库变更：notes 表的 content 列继续存储 TEXT，无需结构变更
- 迁移标识：在 notes 表新增 `content_format` 字段（`'markdown'` | `'tiptap'`），首次转换后写入 `'markdown'`
