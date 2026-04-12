# URL 编解码工具设计方案

## 概述

为百宝箱新增 URL 编解码工具，支持 encodeURIComponent/decodeURIComponent 与 encodeURI/decodeURI 两种模式，并提供 URL 结构解析和历史记录功能。

## 功能范围

| 功能 | 说明 |
|------|------|
| **编码/解码** | `encodeURIComponent` / `decodeURIComponent`（默认），可切换为 `encodeURI` / `decodeURI` |
| **URL 解析** | 解析 URL 各部分（协议、域名、路径、查询参数），参数表格可独立编辑 |
| **历史记录** | localStorage 持久化，最多 20 条，支持一键回填 |

## 组件结构

```
src/views/tools/UrlCodecToolView.vue   # 唯一组件
```

文件路径：`src/views/tools/UrlCodecToolView.vue`

## 交互流程

### 编码/解码模式
1. 用户输入原始文本（编码）或编码字符串（解码）
2. 选择 URI 模式（Component 或标准 URI）
3. 点击执行，结果显示在右侧输出区
4. 可复制结果或清空

### URL 解析模式
1. 粘贴完整 URL
2. 自动拆解为：协议、域名、路径、查询参数表格
3. 参数表格中可编辑各参数值，修改后同步回 URL 预览
4. 支持新增/删除参数

### 历史记录
1. 每次编码/解码成功自动写入历史
2. 点击历史按钮弹出记录列表
3. 点击记录回填到输入区

## 状态设计

```typescript
type Mode = 'encode' | 'decode' | 'parse'
type UriMode = 'component' | 'standard'

const mode = ref<Mode>('encode')
const uriMode = ref<UriMode>('component')
const textInput = ref('')
const result = ref('')
const urlInput = ref('')
const parsedUrl = ref({
  protocol: '',
  host: '',
  path: '',
  params: {} as Record<string, string>
})
const history = ref<Array<{
  id: string
  value: string
  mode: Mode
  timestamp: number
}>>([])
```

## 持久化

- key: `oneplace_url_history`
- 最多保存 20 条，按 timestamp 倒序
- 编码/解码/解析分别计数，合并取前 20 条

## UI 布局

继承 `ToolLayout` 布局：
- Toolbar: 模式切换 tabs（编码/解码/解析）、URI 模式开关、清空按钮
- Input/Output panes: 编码/解码模式下的输入输出
- URL 解析模式: 替换 input pane 为 URL 输入 + 解析结果展示

## 路由配置

无需新增路由，继续使用 `tools.config.ts` 中已有的 `url-codec` 配置：
- `id: 'url-codec'`
- `routePath: '/toolbox/url-codec'`（需新建空状态改为可用）
