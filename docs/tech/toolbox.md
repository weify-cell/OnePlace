# Toolbox 模块技术方案

## 1. 路由设计

在 `src/router/index.ts` 中添加以下路由：

```typescript
// 在 routes 数组中，在 settings 之前添加
{ path: '/toolbox', component: () => import('@/views/ToolboxView.vue'), meta: { requiresAuth: true } },
{ path: '/toolbox/json', component: () => import('@/views/tools/JsonToolView.vue'), meta: { requiresAuth: true } },
{ path: '/toolbox/image-base64', component: () => import('@/views/tools/ImageBase64ToolView.vue'), meta: { requiresAuth: true } }
```

## 2. 组件/视图设计

### 目录结构
```
src/
  views/
    ToolboxView.vue           # 百宝箱首页（Tab + 卡片网格）
    tools/
      JsonToolView.vue        # JSON 格式化工具
      ImageBase64ToolView.vue # 图片 Base64 转换工具
  components/toolbox/
    ToolCard.vue              # 工具卡片组件
    JsonEditor.vue            # JSON 编辑器封装
    ImageDropZone.vue         # 图片拖拽区域组件
```

### 组件职责

| 组件 | 职责 |
|------|------|
| `ToolboxView.vue` | 工具列表首页，Tab 切换分类，网格展示工具卡片 |
| `ToolCard.vue` | 工具卡片，图标、标题、描述、点击进入 |
| `JsonToolView.vue` | JSON 工具页面布局，功能按钮，结果展示 |
| `JsonEditor.vue` | Monaco Editor 封装，处理编辑器初始化 |
| `ImageBase64ToolView.vue` | 图片 Base64 工具页面，输入/输出区域 |
| `ImageDropZone.vue` | 拖拽上传区域，支持点击选择、粘贴 |

## 3. JSON 编辑器选型建议

### 方案对比

| 方案 | 优点 | 缺点 | 包大小 |
|------|------|------|--------|
| **Monaco Editor** | 功能强大，VS Code 同款，支持折叠、验证、格式化 | 体积大（~3MB gzip） | 大 |
| **CodeMirror 6** | 轻量，可定制，支持 JSON 模式 | 功能较 Monaco 弱 | 中 |
| **简单方案** (NInput + JSON.parse) | 无额外依赖，最简单 | 无代码折叠、语法高亮 | 无 |

### 推荐方案：Monaco Editor

理由：
1. JSON 格式化工具的核心价值是代码折叠和语法验证
2. 项目已使用 Vue 3 + Vite，Monaco 集成成熟
3. 工具页面非首屏，可接受懒加载

安装命令：
```bash
npm install monaco-editor @monaco-editor/loader
```

使用方式：
- 使用 `@monaco-editor/loader` 按需加载，减少首屏负担
- 配置 `json` 语言模式，启用验证和格式化

## 4. 关键实现技术点

### 4.1 文件拖拽处理

```typescript
// 核心逻辑
function setupDropZone(element: HTMLElement, onDrop: (files: File[]) => void) {
  element.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'copy'
    element.classList.add('drag-over')
  })

  element.addEventListener('dragleave', () => {
    element.classList.remove('drag-over')
  })

  element.addEventListener('drop', (e) => {
    e.preventDefault()
    element.classList.remove('drag-over')
    const files = Array.from(e.dataTransfer?.files || [])
    onDrop(files)
  })
}
```

### 4.2 剪贴板粘贴图片

```typescript
// 监听 paste 事件
element.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        // 处理图片文件
        processImage(file)
      }
    }
  }
})
```

### 4.3 FileReader 读取文件

```typescript
// 读取为 Base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 读取为文本（JSON 文件）
function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}
```

### 4.4 Base64 转图片

```typescript
// 将 Base64/DataURI 转换为 Blob，然后创建 ObjectURL 预览
function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',')
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png'
  const binary = atob(parts[1] || parts[0])
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return new Blob([array], { type: mime })
}

// 创建预览 URL
const blob = base64ToBlob(base64String)
const previewUrl = URL.createObjectURL(blob)
```

## 5. 依赖清单

### 新增依赖

```bash
# Monaco Editor
npm install monaco-editor @monaco-editor/loader
```

### 无需新增依赖

- 文件拖拽：原生 API
- 剪贴板：原生 Clipboard API
- FileReader：原生 API
- Base64 转换：原生 atob/btoa

## 6. 文件清单

### 新建文件

| 文件路径 | 说明 |
|---------|------|
| `src/views/ToolboxView.vue` | 百宝箱首页 |
| `src/views/tools/JsonToolView.vue` | JSON 工具页面 |
| `src/views/tools/ImageBase64ToolView.vue` | 图片 Base64 工具页面 |
| `src/components/toolbox/ToolCard.vue` | 工具卡片组件 |
| `src/components/toolbox/JsonEditor.vue` | Monaco Editor 封装 |
| `src/components/toolbox/ImageDropZone.vue` | 图片拖拽区域组件 |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/router/index.ts` | 添加 toolbox 相关路由 |
| `src/App.vue` | 添加侧边栏百宝箱入口（需查看具体布局文件） |

## 7. 侧边栏入口位置

根据 PRD，百宝箱入口应放在 AI 对话之后，设置之前。

需要在主布局文件中添加侧边栏菜单项（需查看具体布局实现）。

## 8. 技术约束确认

- [x] 纯前端实现，无后端依赖
- [x] 完全无状态，不持久化
- [x] 使用 Vue 3 + Naive UI
- [x] 使用 TypeScript

## 9. 接口文档

本模块纯前端实现，无后端接口。

## 10. 数据库变更

本模块无数据库变更。

## 11. 架构决策记录

### ADR-001: JSON 编辑器选型

**决策**：使用 Monaco Editor

**理由**：
- JSON 工具的核心价值是代码折叠和语法验证
- Monaco 是 VS Code 同款编辑器，用户体验一致
- 工具页面非首屏，懒加载可接受

**替代方案**：CodeMirror 6（功能较弱）、简单 textarea（无高亮）

---

### ADR-002: 图片处理方案

**决策**：使用原生 FileReader + Canvas（如需压缩）

**理由**：
- 无需额外依赖
- 满足 Base64 互转需求
- 支持拖拽、粘贴、文件选择三种输入方式

---

### ADR-003: 状态管理

**决策**：使用 Vue 组件内部状态，不使用 Pinia

**理由**：
- 工具完全无状态，刷新即清空
- 无需跨组件共享状态
- 保持简单，避免过度设计
