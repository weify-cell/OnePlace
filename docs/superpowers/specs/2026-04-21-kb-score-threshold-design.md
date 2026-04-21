# 知识库分数阈值配置 — 设计文档

## 概述

为知识库检索增加 `score_threshold` 机制，低于设定阈值的块不返回，避免低质量匹配污染上下文。

## 现有架构

```
用户查询 → embedText() → searchChunks(queryVector, topK) → Qdrant → buildKnowledgeBaseContext()
```

`searchChunks` 目前只传 `limit: topK`，无阈值过滤，所有结果均返回。

## 改动设计

### 1. 新增设置键

| 键名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `kb_score_threshold` | number | 0.5 | 相似度分数阈值，0~1 |

设置通过已有的 `settings` 表键值对机制自动持久化，无需迁移文件。

### 2. 后端改动

**文件：** `server/src/services/vector/vector.service.ts`

`searchChunks` 函数签名不变，读取阈值后传给 Qdrant：

```typescript
// searchChunks 内
const threshold = getSettingValue<number>('kb_score_threshold', 0.5)
const result = await qdrantRequest(`/collections/${collection}/points/search`, 'POST', {
  vector: queryVector,
  limit: topK,
  score_threshold: threshold,  // 新增
  with_payload: true,
})
```

当 `score_threshold` 为 0 时 Qdrant 仍正常运作（等同于不过滤）。

### 3. 前端改动

**文件：** `src/views/SettingsView.vue`

在知识库配置区块（`kb_top_k` 输入框下方）添加：

```vue
<n-form-item label="相似度阈值">
  <n-input-number
    v-model:value="localSettings.kb_score_threshold"
    :min="0"
    :max="1"
    :step="0.05"
    style="width: 120px"
  />
  <template #feedback>低于此分数的块将被过滤（默认 0.5）</template>
</n-form-item>
```

默认值 0.5 通过 `localSettings` 初始化时传入。

### 4. 数据流

```
用户设置 kb_score_threshold → settings 表
    ↓
searchChunks() → getSettingValue('kb_score_threshold', 0.5)
    ↓
Qdrant POST { score_threshold: 0.5 }
    ↓
只返回 score >= 0.5 的块
```

## 实现顺序

1. `server/src/services/vector/vector.service.ts` — 添加 threshold 读取和传递
2. `src/views/SettingsView.vue` — 添加 UI 输入框
3. 验证：查询测试，确认低分块被过滤

## 边界情况

- 数据库无 `kb_score_threshold` 记录 → `getSettingValue` 返回默认值 0.5，正常运行
- 设置为 0 → Qdrant 返回所有结果（等同于无阈值）
- 设置为 1 → 只有完美匹配才返回（实际几乎无结果）
- top_k=5 但只有 3 个 >= threshold → 只返回 3 个（由 Qdrant 语义决定）
