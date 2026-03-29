# 前端开发输出 - 文本比较工具 (Text Diff)

## 迭代信息

| 字段 | 值 |
|------|-----|
| 版本号 | v1.6 |
| 模块标识 | toolbox-text-diff |
| 迭代目标 | 百宝箱新增文本比较工具，支持逐字符 diff |
| 完成日期 | 2026-03-29 |

---

## 已完成工作

### Bug 修复

#### Bug-007: 变量名遮蔽导致 diff 功能失效
**文件**: `src/utils/text-diff.ts`

**问题**: 第 49 行 `let diffChars = 0` 变量名遮蔽了第 1 行导入的 `diffChars` 函数，导致 diff 计算完全失效。

**修复**:
- 第 49 行: `let diffChars = 0` → `let diffCharCount = 0`
- 第 55 行: `diffChars += ...` → `diffCharCount += ...`
- 第 66 行: `diffChars` → `diffCharCount`

**验证**: npm run typecheck 和 npm run build 均通过

---

### 1. 新增 diff 依赖
**文件**: `package.json`

新增依赖：
- `diff` ^5.x - 字符级 diff 算法
- `@types/diff` - TypeScript 类型定义

### 2. 新增文本 diff 工具函数
**文件**: `src/utils/text-diff.ts`

导出函数：
- `computeDiff(original, compare, options)` - 执行 diff 计算
- `generateReport(result, original, compare, positions)` - 生成纯文本报告
- `getDiffPositions(changes, originalText, compareText)` - 获取差异位置
- `offsetToLineCol(text, offset)` - 字符偏移转行列号
- `getTextLengthStatus(textLength)` - 获取长度状态（normal/warning/error）

### 3. 新增差异结果面板组件
**文件**: `src/components/toolbox/DiffResultPanel.vue`

功能：
- 字符级差异渲染，新增（绿色）/ 删除（红色+删除线）
- 差异点击导航
- `scrollIntoView` 平滑滚动到当前差异
- `.diff-active` 高亮样式

### 4. 新增文本比较工具页面
**文件**: `src/views/tools/TextDiffToolView.vue`

功能：
- 双栏输入（原文 / 对比文）
- 实时 diff（10000 字符以内，防抖 300ms）
- 大文本警告（>10000 切换手动模式）
- 大文本拒绝（>50000 显示错误）
- 上一处/下一处差异导航
- 复制差异报告（纯文本格式，含行列信息）
- 清空功能（分别清空/一键清空）

### 5. 修改路由配置
**文件**: `src/router/index.ts`

新增路由：
```typescript
{ path: '/toolbox/text-diff', component: () => import('@/views/tools/TextDiffToolView.vue'), meta: { requiresAuth: true } }
```

### 6. 修改百宝箱首页
**文件**: `src/views/ToolboxView.vue`

- 新增 `diff` 分类
- 新增「文本比较」工具卡片（📊 图标）
- 新增「文本比较」Tab 页

---

## 文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `package.json` | 修改 | 新增 diff 依赖 |
| `src/utils/text-diff.ts` | 新增 | diff 算法封装 |
| `src/components/toolbox/DiffResultPanel.vue` | 新增 | 差异结果渲染面板 |
| `src/views/tools/TextDiffToolView.vue` | 新增 | 文本比较工具主视图 |
| `src/router/index.ts` | 修改 | 新增路由 |
| `src/views/ToolboxView.vue` | 修改 | 新增工具卡片和 Tab |

---

## 技术实现细节

### 差异报告格式
```
文本差异报告
==================

生成时间：2026-03-29 12:00:00

差异总数：3 处
相同字符：156
差异字符：8

------------------
差异 1/3
位置：第 3 行，第 5 列
内容：「A」
类型：删除
------------------
```

### CSS 样式类
```css
.diff-added    { background-color: #d4edda; color: #155724; }
.diff-removed  { background-color: #f8d7da; color: #721c24; text-decoration: line-through; }
.diff-active   { outline: 2px solid #007bff; }
```

### 大文本处理策略
| 字符数 | 模式 | 行为 |
|--------|------|------|
| < 10000 | 实时 | 300ms 防抖自动计算 |
| 10000-50000 | 手动 | 显示警告，点击按钮触发 |
| > 50000 | 拒绝 | 显示错误提示 |

---

## 验证结果

- 类型检查：vue-tsc --noEmit 通过
- 生产构建：vite build 成功
- 路由注册：/toolbox/text-diff 正常

---

## 注意事项

- 纯前端实现，无后端 API 依赖
- 刷新页面清空所有数据
- 差异导航使用 `scrollIntoView` 需等待 DOM 更新（nextTick）
