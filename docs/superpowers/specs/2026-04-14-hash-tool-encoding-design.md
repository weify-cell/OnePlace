# 哈希工具编码转换功能设计

## 概述

为 `HashToolView.vue` 新增第四个标签页 "编码转换"，集成 Base64、URL、Hex 三种常见编码的编码/解码功能。

## UI 变更

### 顶部 Tab 栏新增
- 新增 `<n-button>` — "编码转换"，位于 SHA-3/SM3 右侧
- 点击后 `tabMode` 切换为 `'encoding'`，`selectedAlgorithm` 不适用

### 编码转换标签页布局

```
[ 编码 | 解码 ]  ← n-button-group

[ 输入文本框 (rows=8) ]
[ 执行按钮 ]

───────────────────────────────────────────────────

[ 输出结果 (readonly, rows=8) ]
[ 复制按钮 ]
```

## 组件状态

```ts
type TabMode = 'md5-sha1' | 'sha2' | 'sha3-sm3' | 'encoding'
type TransformMode = 'encode' | 'decode'

const transformMode = ref<TransformMode>('encode')
const encodeInput = ref('')
const encodeResult = ref('')
const decodeInput = ref('')
const decodeResult = ref('')
const encodingError = ref('')
```

## 功能实现

### Base64 编解码
```ts
// 复用 Base64CodecToolView.vue 逻辑
function btoaUtf8(str: string): string {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
}
function atobUtf8(str: string): string {
  return decodeURIComponent(atob(str).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
}
```

### URL 编解码
```ts
function encodeText() { encodeResult.value = encodeURIComponent(encodeInput.value) }
function decodeText() { decodeResult.value = decodeURIComponent(decodeInput.value) }
```

### Hex 编解码
```ts
function strToHex(str: string): string {
  return Array.from(new TextEncoder().encode(str)).map(b => b.toString(16).padStart(2, '0')).join('')
}
function hexToStr(hex: string): string {
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  return new TextDecoder().decode(bytes)
}
```

## 错误处理

- 解码失败时显示 `n-tag type="error"` 并在 status bar 提示
- 空输入时 `message.warning` 提示
- 解码时验证 Hex 格式（偶数个十六进制字符）

## 行为约定

- 切换 Tab 时清空所有编码相关状态
- 编码/解码切换时清空对应输入/输出
- `Ctrl+Enter` 快捷键触发当前操作
