# 知识库分数阈值配置 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为知识库检索添加 `score_threshold` 机制，低于设定值的块不返回给用户。

**Architecture:** 在 `searchChunks()` 调用 Qdrant 时传入 `score_threshold` 参数。前端设置页面新增阈值输入框，持久化到 `settings` 表的 `kb_score_threshold` 键。

**Tech Stack:** better-sqlite3 (settings), Qdrant API, Vue 3 + Naive UI

---

## 文件变更清单

| 文件 | 改动 |
|------|------|
| `server/src/services/vector/vector.service.ts` | 修改 `searchChunks()` 添加 `score_threshold` 参数 |
| `src/views/SettingsView.vue` | 添加阈值输入框 UI |

无新增文件，无数据库迁移。

---

## Task 1: 后端 — `searchChunks` 添加阈值参数

**Files:**
- Modify: `server/src/services/vector/vector.service.ts`

- [ ] **Step 1: 读取 `searchChunks` 函数，找到 Qdrant 请求位置**

打开 `server/src/services/vector/vector.service.ts`，找到 `searchChunks` 函数中调用 `qdrantRequest` 的位置。

- [ ] **Step 2: 添加 `score_threshold` 传递**

在 `qdrantRequest` 的请求体中添加 `score_threshold: threshold`，读取方式与其他 KB 设置相同（`getSettingValue`）。

修改后的请求体：

```typescript
const threshold = getSettingValue<number>('kb_score_threshold', 0.5)
const result = await qdrantRequest(`/collections/${collection}/points/search`, 'POST', {
  vector: queryVector,
  limit: topK,
  score_threshold: threshold,
  with_payload: true,
})
```

- [ ] **Step 3: 验证 tsc 类型检查通过**

```bash
cd server && npm run typecheck
```

Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add server/src/services/vector/vector.service.ts
git commit -m "feat(kb): pass score_threshold to Qdrant search"
```

---

## Task 2: 前端 — 设置页面添加阈值输入框

**Files:**
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: 找到知识库配置的 `kb_top_k` 位置**

在 `SettingsView.vue` 中搜索 `kb_top_k`，确认其 `n-input-number` 组件的上下文。

- [ ] **Step 2: 在 `kb_top_k` 下方添加阈值输入框**

在 `kb_top_k` 的 `n-input-number` 下方添加：

```vue
<n-form-item label="相似度阈值">
  <n-input-number
    v-model:value="localSettings.kb_score_threshold"
    :min="0"
    :max="1"
    :step="0.05"
    :precision="2"
    style="width: 120px"
  />
  <template #feedback>低于此分数的块将被过滤（默认 0.5）</template>
</n-form-item>
```

- [ ] **Step 3: 确保 `localSettings` 初始化包含 `kb_score_threshold: 0.5`**

找到 `localSettings` 的初始化或 reactive 定义处，确认 `kb_score_threshold` 的默认值 0.5 存在（如果尚未定义）。如果没有，在对象中加上。

- [ ] **Step 4: 验证 vue-tsc 类型检查通过**

```bash
npm run typecheck
```

Expected: 无类型错误

- [ ] **Step 5: 提交**

```bash
git add src/views/SettingsView.vue
git commit -m "feat(settings): add kb_score_threshold input"
```

---

## Task 3: 验证

**Files:**
- 无文件变更

- [ ] **Step 1: 启动后端确认无报错**

```bash
npm run server
```

Expected: 服务器启动无 `duplicate column` 或其他错误

- [ ] **Step 2: 打开设置页面，确认阈值输入框显示且可调节**

预期：输入框默认值为 0.5，范围 0~1，步进 0.05。

- [ ] **Step 3: 提交所有变更**

如前两步通过，确保所有文件已提交。
