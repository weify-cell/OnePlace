# Architect 输出 - 文本比较工具

## 迭代信息

| 字段 | 值 |
|------|-----|
| 版本号 | v1.6 |
| 模块标识 | toolbox-text-diff |
| 架构版本 | v1.0 |
| 设计日期 | 2026-03-29 |

---

## 一、技术决策点确认

### 1. diff 算法库选择

**决策：采用 `diff` 库（npm）**

| 方案 | 推荐 | 理由 |
|------|------|------|
| `diff` 库 | **是** | 成熟稳定，字符级 diff 支持完善，npm 周下载量高，适合前端集成 |
| `jsdiff` | 否 | 实际是同一库，封装方式不同 |
| 手写 LCS | 否 | 实现复杂，边缘情况多，无必要 |

**集成方式**：
```bash
npm install diff
npm install -D @types/diff
```

**使用示例**：
```typescript
import { diffChars } from 'diff'

const result = diffChars(originalText, compareText)
// result 为 Change[] 数组，每个元素包含 value、added、removed 属性
```

---

### 2. 大文本处理策略（>10000 字符）

**决策：警告 + 手动触发模式**

- **10000 字符以内**：实时比较（每次输入触发）
- **超过 10000 字符**：
  - 显示红色警告提示「文本较长，比较可能需要数秒」
  - 禁用实时比较，改为「比较」按钮手动触发
  - 使用 `requestAnimationFrame` 分批处理，每批 2000 字符
- **超过 50000 字符**：显示错误提示「文本过长，请控制在 50000 字符以内」

**理由**：
- 避免大文本时频繁计算导致 UI 卡顿
- 分批处理确保 60fps 渲染体验
- 手动触发给予用户控制权

---

### 3. 差异导航实现

**决策：JavaScript `scrollIntoView` + 锚点标记**

- 每个差异位置用 `data-diff-index` 属性标记
- 导航时调用 `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`
- 当前差异项添加 `.diff-active` 高亮样式

**理由**：
- 纯前端实现，无锚点服务端支持
- `scrollIntoView` 兼容性良好（IE11+）
- 配合 `requestAnimationFrame` 可实现平滑滚动

---

### 4. 复制报告格式

**决策：纯文本格式**

**报告模板**：
```
文本差异报告
生成时间：2026-03-29 12:00:00
==================

差异总数：3 处
相同字符：156
差异字符：8

------------------
差异 1/3
位置：第 3 行，第 5 列
原文：「A」
对比：「B」
类型：修改

------------------
差异 2/3
位置：第 5 行，第 1 列
原文：「Hello」
对比：「」
类型：删除

...
```

**理由**：
- 纯文本便于粘贴到邮件、文档等场景
- 避免 HTML 格式在目标应用中样式丢失
- 无需考虑 XSS 防护问题

---

## 二、纯前端实现确认

本模块**无后端依赖**，所有逻辑在浏览器端完成：

- 无新增 API 接口
- 无数据库变更
- 无状态持久化（刷新页面清空）

---

## 三、文件变更清单

### 新增文件

| 文件路径 | 说明 |
|----------|------|
| `src/views/tools/TextDiffToolView.vue` | 文本比较工具主视图 |
| `src/components/toolbox/DiffResultPanel.vue` | 差异结果展示面板组件 |
| `src/utils/text-diff.ts` | diff 算法封装工具函数 |

### 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `src/router/index.ts` | 新增 `/toolbox/text-diff` 路由 |
| `src/views/ToolboxView.vue` | 新增「文本比较」工具卡片链接 |
| `package.json` | 新增 `diff` 依赖 |

---

## 四、组件设计

### TextDiffToolView.vue

**职责**：页面容器，状态管理，用户交互

**状态**：
```typescript
const originalText = ref('')      // 原文
const compareText = ref('')       // 对比文
const diffResult = ref<Change[]>([])  // diff 结果
const currentDiffIndex = ref(-1) // 当前导航位置
const isComputing = ref(false)    // 计算中状态
const charLimit = 50000           // 字符上限
```

**核心方法**：
- `computeDiff()` - 执行 diff 计算
- `navigatePrev()` / `navigateNext()` - 差异导航
- `copyReport()` - 复制差异报告
- `clearAll()` - 清空全部

---

### DiffResultPanel.vue

**职责**：渲染 diff 结果，差异高亮，导航交互

**Props**：
```typescript
props: {
  diffs: Array<Change>,     // diff 结果
  currentIndex: Number,      // 当前索引
  onNavigate: Function      // 导航回调
}
```

**渲染策略**：
- 字符级遍历，每个字符包装 `<span>`
- `added` → `.diff-added`（绿色背景）
- `removed` → `.diff-removed`（红色背景 + 删除线）
- 普通字符 → 无样式
- 差异项添加 `data-diff-index` 供 `scrollIntoView` 调用

---

### text-diff.ts 工具函数

```typescript
import { diffChars, type Change } from 'diff'

export interface DiffOptions {
  maxLength?: number      // 超过此长度提示
  batchSize?: number      // 分批处理大小
}

export interface DiffResult {
  changes: Change[]
  stats: {
    totalDiffs: number
    sameChars: number
    diffChars: number
  }
}

export function computeDiff(original: string, compare: string, options?: DiffOptions): DiffResult

export function generateReport(result: DiffResult, original: string, compare: string): string

export function getDiffPositions(changes: Change[]): Array<{ index: number, line: number, col: number }>
```

---

## 五、路由配置

```typescript
{
  path: '/toolbox/text-diff',
  component: () => import('@/views/tools/TextDiffToolView.vue'),
  meta: { requiresAuth: true }
}
```

---

## 六、依赖清单

| 依赖 | 版本 | 用途 |
|------|------|------|
| `diff` | ^5.x | 字符级 diff 算法 |

**安装命令**：
```bash
npm install diff
npm install -D @types/diff
```

---

## 七、验收要点（供 tester agent 参考）

1. **基本比较**：「你好世界」vs「你好中国」应显示 2 处差异
2. **完全相同**：两侧相同显示「无差异」
3. **差异导航**：点击「下一处」应滚动到对应位置并高亮
4. **大文本警告**：输入 >10000 字符应显示警告并切换手动模式
5. **复制报告**：复制内容应包含行号、列号、差异类型
6. **清空功能**：清空后结果区域和统计重置
7. **多行处理**：精确到每行每列的差异位置

---

## 八、后续前端开发需读文档

- `docs/prd/toolbox.md` → 文本比较工具章节（功能需求）
- `docs/handoff/pm-output.md` → PM 交接文档（需求摘要）
- `src/views/tools/JsonToolView.vue` → 参考现有工具视图代码风格
- `docs/handoff/architect-output.md` → 本文档（技术方案）

---

## 九、关键实现细节

### 差异位置计算

需要将字符偏移转换为行号和列号：

```typescript
function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const lines = text.substring(0, offset).split('\n')
  return {
    line: lines.length,
    col: lines[lines.length - 1].length + 1
  }
}
```

### 分批处理大文本

```typescript
async function computeDiffBatched(original: string, compare: string, batchSize = 2000): Promise<Change[]> {
  // 使用 diffChars 分批处理，避免阻塞主线程
}
```

### 样式类名

```css
.diff-added    { background-color: #d4edda; color: #155724; }
.diff-removed  { background-color: #f8d7da; color: #721c24; text-decoration: line-through; }
.diff-active   { outline: 2px solid #007bff; }
```
