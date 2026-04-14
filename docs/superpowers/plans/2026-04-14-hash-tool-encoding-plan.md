# 哈希工具编码转换功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 HashToolView.vue 新增第四个标签页 "编码转换"，支持 Base64、URL、Hex 三种编码的编码/解码功能

**Architecture:** 在现有三标签页架构基础上，新增 `tabMode = 'encoding'` 分支。编码转换逻辑完全内聚在 `HashToolView.vue` 中，不涉及跨组件共享。

**Tech Stack:** Vue 3 Composition API + Naive UI + 原生浏览器 API（btoa/atob/encodeURIComponent）

---

## 文件清单

- 修改: `src/views/tools/HashToolView.vue` — 新增编码转换标签页及所有相关状态和函数

---

## 任务分解

### Task 1: 新增 Tab 状态和编码相关状态

**Files:**
- Modify: `src/views/tools/HashToolView.vue:14-16` (type 定义)
- Modify: `src/views/tools/HashToolView.vue:17-29` (ref 状态)

- [ ] **Step 1: 扩展 TabMode 类型**

```ts
// 旧 (第14-16行)
type TabMode = 'md5-sha1' | 'sha2' | 'sha3-sm3'
type InputMode = 'text' | 'file'
type TransformMode = 'encode' | 'decode'  // 新增

// 旧 (第17-29行) 新增以下 ref
const transformMode = ref<TransformMode>('encode')
const encodeInput = ref('')
const encodeResult = ref('')
const decodeInput = ref('')
const decodeResult = ref('')
const encodingError = ref('')
```

- [ ] **Step 2: Commit**

```bash
git add src/views/tools/HashToolView.vue
git commit -m "feat(hash): add encoding tab state to HashToolView"
```

---

### Task 2: 新增编码/解码辅助函数

**Files:**
- Modify: `src/views/tools/HashToolView.vue` (在 `formatFileSize` 函数后新增)

- [ ] **Step 1: 在 `formatFileSize` 函数后添加编码函数**

```ts
// Base64 UTF-8 编解码
function btoaUtf8(str: string): string {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
}

function atobUtf8(str: string): string {
  return decodeURIComponent(atob(str).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
}

// Hex 编解码
function strToHex(str: string): string {
  return Array.from(new TextEncoder().encode(str)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToStr(hex: string): string {
  const match = hex.match(/.{2}/g)
  if (!match) throw new Error('Invalid hex string')
  return new TextDecoder().decode(new Uint8Array(match.map(b => parseInt(b, 16))))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/tools/HashToolView.vue
git commit -m "feat(hash): add Base64 and Hex encoding/decoding utility functions"
```

---

### Task 3: 新增编码操作函数

**Files:**
- Modify: `src/views/tools/HashToolView.vue` (clearAll 函数附近新增)

- [ ] **Step 1: 添加 encodeText / decodeText / copyEncode / copyDecode 函数**

```ts
function encodeText() {
  encodingError.value = ''
  const input = encodeInput.value
  if (!input) {
    message.warning('请输入文本内容')
    return
  }
  try {
    encodeResult.value = btoaUtf8(input)
  } catch {
    encodingError.value = '编码失败：无效字符'
    message.error('编码失败')
  }
}

function decodeText() {
  encodingError.value = ''
  const input = decodeInput.value.trim()
  if (!input) {
    message.warning('请输入 Base64 内容')
    return
  }
  try {
    decodeResult.value = atobUtf8(input)
  } catch {
    encodingError.value = '解码失败：无效 Base64 格式'
    message.error('解码失败：无效 Base64 格式')
  }
}

async function copyEncodeResult() {
  if (!encodeResult.value) { message.warning('没有可复制的内容'); return }
  try {
    await navigator.clipboard.writeText(encodeResult.value)
    message.success('已复制到剪贴板')
  } catch { message.error('复制失败') }
}

async function copyDecodeResult() {
  if (!decodeResult.value) { message.warning('没有可复制的内容'); return }
  try {
    await navigator.clipboard.writeText(decodeResult.value)
    message.success('已复制到剪贴板')
  } catch { message.error('复制失败') }
}
```

- [ ] **Step 2: 更新 clearAll 函数**，在末尾添加:

```ts
// 在 clearAll 函数末尾添加
encodeInput.value = ''
encodeResult.value = ''
decodeInput.value = ''
decodeResult.value = ''
encodingError.value = ''
```

- [ ] **Step 3: Commit**

```bash
git add src/views/tools/HashToolView.vue
git commit -m "feat(hash): add encode/decode action functions"
```

---

### Task 4: 新增编码标签页的 Tab Button

**Files:**
- Modify: `src/views/tools/HashToolView.vue:230-237` (SHA-3/SM3 button 后)

- [ ] **Step 1: 在 SHA-3/SM3 按钮组后、第一个 `<n-divider vertical />` 前添加编码转换 Tab Button**

```vue
<n-button
  :type="tabMode === 'encoding' ? 'primary' : 'default'"
  size="small"
  @click="selectTab('encoding')"
>
  编码转换
</n-button>
```

- [ ] **Step 2: Commit**

```bash
git add src/views/tools/HashToolView.vue
git commit -m "feat(hash): add encoding tab button to toolbar"
```

---

### Task 5: 新增编码标签页模板

**Files:**
- Modify: `src/views/tools/HashToolView.vue` (input template 区域)

- [ ] **Step 1: 在 `</template>` 闭合前、`<template #input>` 的 `v-if="inputMode === 'file'"` 分支之后添加**

```vue
<!-- Encoding transform mode -->
<template v-else-if="tabMode === 'encoding'">
  <div class="h-full flex flex-col justify-center">
    <!-- Mode toggle -->
    <n-button-group style="margin-bottom: 16px">
      <n-button
        :type="transformMode === 'encode' ? 'primary' : 'default'"
        size="small"
        @click="transformMode = 'encode'"
      >
        编码
      </n-button>
      <n-button
        :type="transformMode === 'decode' ? 'primary' : 'default'"
        size="small"
        @click="transformMode = 'decode'"
      >
        解码
      </n-button>
    </n-button-group>

    <!-- Input -->
    <n-input
      v-if="transformMode === 'encode'"
      v-model:value="encodeInput"
      type="textarea"
      placeholder="请输入文本内容..."
      :rows="8"
      class="font-mono text-sm"
      @keyup.enter.ctrl="encodeText"
    />
    <n-input
      v-else
      v-model:value="decodeInput"
      type="textarea"
      placeholder="请输入 Base64/URL/Hex 字符串..."
      :rows="8"
      class="font-mono text-sm"
      @keyup.enter.ctrl="decodeText"
    />

    <!-- Action buttons -->
    <div class="flex gap-2" style="margin-top: 16px">
      <n-button
        type="primary"
        size="large"
        style="flex: 1"
        @click="transformMode === 'encode' ? encodeText() : decodeText()"
      >
        {{ transformMode === 'encode' ? '编码' : '解码' }}
      </n-button>
    </div>

    <!-- Encoding type selector -->
    <div class="flex gap-2" style="margin-top: 12px">
      <n-tag type="info" size="small">Base64 / URL / Hex</n-tag>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/views/tools/HashToolView.vue
git commit -m "feat(hash): add encoding transform tab template"
```

---

### Task 6: 新增编码标签页 Output 模板

**Files:**
- Modify: `src/views/tools/HashToolView.vue` (output template 区域)

- [ ] **Step 1: 在 `</template>` 闭合前、output 区域末尾添加**

```vue
<!-- Encoding transform output -->
<template v-else-if="tabMode === 'encoding'">
  <div class="h-full flex flex-col justify-center">
    <n-input
      v-if="transformMode === 'encode'"
      v-model:value="encodeResult"
      type="textarea"
      :rows="8"
      readonly
      class="font-mono text-sm"
      placeholder="编码结果将显示在这里"
    />
    <n-input
      v-else
      v-model:value="decodeResult"
      type="textarea"
      :rows="8"
      readonly
      class="font-mono text-sm"
      placeholder="解码结果将显示在这里"
    />
    <n-button
      v-if="transformMode === 'encode' ? encodeResult : decodeResult"
      type="info"
      size="small"
      style="margin-top: 12px; align-self: flex-start"
      @click="transformMode === 'encode' ? copyEncodeResult() : copyDecodeResult()"
    >
      <template #icon>
        <span>📄</span>
      </template>
      复制
    </n-button>
    <n-tag v-if="encodingError" type="error" size="small" style="margin-top: 8px">
      {{ encodingError }}
    </n-tag>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/views/tools/HashToolView.vue
git commit -m "feat(hash): add encoding transform output template"
```

---

### Task 7: 验证 TypeScript 类型和编译

**Files:**
- Check: `src/views/tools/HashToolView.vue`

- [ ] **Step 1: 运行 typecheck**

```bash
npm run typecheck
```

Expected: 无 TypeScript 错误

- [ ] **Step 2: 如有错误，根据提示修复后重新 typecheck**

- [ ] **Step 3: Commit any fixes**

```bash
git add src/views/tools/HashToolView.vue
git commit -m "fix(hash): resolve typecheck errors in encoding feature"
```

---

## 验证步骤

1. 启动开发服务器 `npm run dev`
2. 访问哈希工具页面
3. 点击 "编码转换" 标签页
4. 测试编码功能：输入中文/英文文本 → 点击编码 → 验证 Base64 输出
5. 测试解码功能：输入 Base64 字符串 → 点击解码 → 验证原文输出
6. 测试 Ctrl+Enter 快捷键
7. 测试复制按钮
8. 测试清空按钮
9. 切换回 MD5 标签页，验证原有哈希计算功能不受影响

---

## 完成后

- [ ] 所有任务完成并 commit
- [ ] typecheck 通过
- [ ] 功能验证通过
