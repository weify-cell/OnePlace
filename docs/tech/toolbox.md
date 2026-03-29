# Toolbox 模块技术方案

## 版本信息
- 版本号：v1.1
- 更新日期：2026-03-29
- 变更内容：调整 Tab 结构，将 JSON工具、图片工具独立为一级分类

---

## 1. 路由设计

在 `src/router/index.ts` 中添加以下路由：

```typescript
// 在 routes 数组中，在 settings 之前添加
{ path: '/toolbox', component: () => import('@/views/ToolboxView.vue'), meta: { requiresAuth: true } },
{ path: '/toolbox/json', component: () => import('@/views/tools/JsonToolView.vue'), meta: { requiresAuth: true } },
{ path: '/toolbox/image-base64', component: () => import('@/views/tools/ImageBase64ToolView.vue'), meta: { requiresAuth: true } }
```

---

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
| `ToolCard.vue` | 工具卡片，图标、标题、描述、点击进入，支持「即将推出」状态 |
| `JsonToolView.vue` | JSON 工具页面布局，功能按钮，结果展示 |
| `JsonEditor.vue` | Monaco Editor 封装，处理编辑器初始化 |
| `ImageBase64ToolView.vue` | 图片 Base64 工具页面，输入/输出区域 |
| `ImageDropZone.vue` | 拖拽上传区域，支持点击选择、粘贴 |

---

## 3. Tab 分类配置

### 分类定义
```typescript
interface ToolCategory {
  id: string
  name: string
  icon?: string
}

const categories: ToolCategory[] = [
  { id: 'all', name: '全部' },
  { id: 'time', name: '时间工具' },
  { id: 'encode', name: '编码工具' },
  { id: 'json', name: 'JSON工具' },
  { id: 'image', name: '图片工具' }
]
```

### 工具配置
```typescript
interface Tool {
  id: string
  name: string
  description: string
  icon: string
  category: string[]  // 所属分类（可多选）
  route: string
  status: 'available' | 'coming-soon'
}

const tools: Tool[] = [
  {
    id: 'json-formatter',
    name: 'JSON 格式化',
    description: '格式化、压缩、验证、转义',
    icon: '📝',
    category: ['all', 'json'],
    route: '/toolbox/json',
    status: 'available'
  },
  {
    id: 'image-base64',
    name: '图片 Base64',
    description: '拖拽、粘贴、图片互转',
    icon: '🖼️',
    category: ['all', 'image'],
    route: '/toolbox/image-base64',
    status: 'available'
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    description: 'Unix 时间戳 ↔ 日期时间',
    icon: '⏰',
    category: ['all', 'time'],
    route: '',
    status: 'coming-soon'
  },
  {
    id: 'url-encode',
    name: 'URL 编解码',
    description: 'URL 编码解码工具',
    icon: '🔗',
    category: ['all', 'encode'],
    route: '',
    status: 'coming-soon'
  },
  {
    id: 'base64-text',
    name: 'Base64 编解码',
    description: '文本 Base64 编码解码',
    icon: '🔤',
    category: ['all', 'encode'],
    route: '',
    status: 'coming-soon'
  },
  {
    id: 'md5-hash',
    name: 'MD5 哈希',
    description: '计算 MD5/SHA 哈希值',
    icon: '#️⃣',
    category: ['all', 'encode'],
    route: '',
    status: 'coming-soon'
  }
]
```

---

## 4. JSON 编辑器选型建议

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

---

## 5. 关键实现技术点

### 5.1 Tab 切换与筛选

```typescript
// 当前选中的分类
const activeCategory = ref('all')

// 根据分类筛选工具
const filteredTools = computed(() => {
  if (activeCategory.value === 'all') {
    return tools
  }
  return tools.filter(tool => tool.category.includes(activeCategory.value))
})
```

### 5.2 文件拖拽处理

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

### 5.3 剪贴板粘贴图片

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

### 5.4 FileReader 读取文件

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

### 5.5 Base64 转图片

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

---

## 6. 依赖清单

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

---

## 7. 文件清单

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

---

## 8. 侧边栏入口位置

根据 PRD，百宝箱入口应放在 AI 对话之后，设置之前。

需要在主布局文件中添加侧边栏菜单项（需查看具体布局实现）。

---

## 9. 技术约束确认

- [x] 纯前端实现，无后端依赖
- [x] 完全无状态，不持久化
- [x] 使用 Vue 3 + Naive UI
- [x] 使用 TypeScript

---

## 10. 接口文档

本模块纯前端实现，无后端接口。

---

## 11. 数据库变更

本模块无数据库变更。

---

## 12. 架构决策记录

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

---

### ADR-004: Tab 分类结构调整（v1.1）

**决策**：将 JSON工具、图片工具从「开发工具」子分类提升为一级 Tab

**变更前**：
- 全部 | 开发工具 | 时间工具 | 编解码工具
- 开发工具下包含：JSON格式化、图片Base64

**变更后**：
- 全部 | 时间工具 | 编码工具 | JSON工具 | 图片工具

**理由**：
- 减少用户点击层级，提升已上线工具的可发现性
- 平级结构更直观，用户无需理解「开发工具」这一抽象概念
- 为后续每个分类独立扩展留出空间

**影响**：
- 工具卡片配置中 `category` 字段需要更新
- Tab 组件从 4 个增加到 5 个
- 路由结构保持不变
