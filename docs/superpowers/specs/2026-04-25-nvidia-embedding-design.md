# 添加 NVIDIA 作为向量模型供应商

## 概述

为知识库功能添加 NVIDIA 作为新的嵌入模型供应商，使用 BGE-M3 模型。

## 变更范围

### 1. 后端 - providers.ts

在 `AI_PROVIDERS` 中添加 `nvidia` 条目：

```ts
nvidia: {
  name: 'nvidia',
  displayName: 'NVIDIA',
  baseURL: 'https://integrate.api.nvidia.com/v1',
  models: [],
  embedding_models: [
    { id: 'bge-m3', name: 'BGE-M3' }
  ]
}
```

### 2. 后端 - embedding-client.ts

在 `EMBEDDING_DIMENSIONS` 中添加维度映射：

```ts
'bge-m3': 1024,
```

### 3. 前端 - SettingsView.vue

在 `embeddingProviderOptions` 中添加 NVIDIA 选项：

```ts
{ label: 'NVIDIA', value: 'nvidia' },
```

## 实施步骤

1. 修改 `server/src/services/ai/providers.ts` 添加 nvidia provider
2. 修改 `server/src/services/ai/embedding-client.ts` 添加 bge-m3 维度
3. 修改 `src/views/SettingsView.vue` 添加 nvidia 到下拉选项
4. 验证知识库功能正常工作
