# Architect 输出 - Excel/JSON 格式转换 v2 技术架构

## 版本信息

| 字段 | 值 |
|------|-----|
| 模块名 | toolbox-excel-json-v2 |
| 版本号 | v1.5 |
| 迭代目标 | 重新设计Excel/JSON转换格式，支持合并单元格1对多转换 |
| 依赖版本 | 基于v1.4 Excel/JSON功能升级 |
| 更新日期 | 2026-03-29 |

---

## 架构概览

### 设计原则
1. **单一职责**：Excel 处理逻辑完全封装在工具函数中
2. **组件化**：Sheet 选择器独立为可复用对话框组件
3. **渐进增强**：不破坏现有功能，新增功能通过选项控制
4. **类型安全**：完整的 TypeScript 类型定义

### 技术栈
- Vue 3 + TypeScript + Naive UI
- xlsx (SheetJS) - Excel 处理
- 纯前端实现，无后端依赖

---

## 组件架构

### 1. 新增组件

#### SheetSelectorDialog.vue
**路径**: `src/components/toolbox/SheetSelectorDialog.vue`

**职责**: 多 Sheet 选择对话框

**Props**:
```typescript
interface Props {
  show: boolean                    // 控制显示/隐藏
  sheets: SheetInfo[]             // Sheet 列表
  initialSelection?: number[]     // 初始选中索引（默认全选）
}
```

**Emits**:
```typescript
interface Emits {
  'update:show': (value: boolean) => void
  'confirm': (selectedIndexes: number[]) => void
  'cancel': () => void
}
```

**UI 结构**:
```
┌─────────────────────────────────────┐
│ 选择要导入的工作表                   │
├─────────────────────────────────────┤
│ ☑ 全选                              │
│ ─────────────────────────────────   │
│ ☑ Sheet1 - 员工表 (100行)          │
│ ☐ Sheet2 - 部门表 (10行)           │
│ ☑ Sheet3 - 配置表 (5行)            │
│                                     │
│ 已选择: 2个                         │
│ 输出格式: 对象 {...}                │
│                                     │
│         [取消]  [确认导入]          │
└─────────────────────────────────────┘
```

**交互逻辑**:
1. 显示时默认选中所有非空 Sheet
2. "全选"复选框控制所有 Sheet
3. 单个 Sheet 可独立勾选/取消
4. 底部实时显示已选数量和输出格式预览
5. 至少选择一个 Sheet 时"确认导入"按钮可用

---

### 2. 修改现有组件

#### JsonToolView.vue
**路径**: `src/views/tools/JsonToolView.vue`

**修改点**:

1. **导入新依赖**:
```typescript
import SheetSelectorDialog from '@/components/toolbox/SheetSelectorDialog.vue'
import { 
  previewExcelSheets, 
  parseExcelFile,
  type SheetInfo 
} from '@/utils/excel'
```

2. **新增状态**:
```typescript
const showSheetSelector = ref(false)
const sheetList = ref<SheetInfo[]>([])
const pendingFile = ref<File | null>(null)
```

3. **修改导入流程**:
```typescript
async function handleFileImport(file: File) {
  try {
    // 1. 预览所有 Sheet
    const sheets = await previewExcelSheets(file)
    
    if (sheets.length === 1) {
      // 单 Sheet 直接导入
      const result = await parseExcelFile(file, { 
        selectedSheetIndexes: [0] 
      })
      inputValue.value = JSON.stringify(result, null, 2)
    } else {
      // 多 Sheet 显示选择器
      sheetList.value = sheets
      pendingFile.value = file
      showSheetSelector.value = true
    }
  } catch (error: any) {
    message.error(error.message)
  }
}

async function onSheetSelectConfirmed(selectedIndexes: number[]) {
  if (!pendingFile.value) return
  
  try {
    const result = await parseExcelFile(pendingFile.value, {
      selectedSheetIndexes: selectedIndexes
    })
    inputValue.value = JSON.stringify(result, null, 2)
    showSheetSelector.value = false
    pendingFile.value = null
  } catch (error: any) {
    message.error(error.message)
  }
}
```

---

## 工具函数架构

### 核心文件: `src/utils/excel.ts`

#### 类型定义扩展

```typescript
// Sheet 信息
export interface SheetInfo {
  name: string           // Sheet 名称
  index: number          // Sheet 索引
  rowCount: number       // 数据行数（不含表头）
  isEmpty: boolean       // 是否为空
}

// Excel 解析选项
export interface ExcelParseOptions {
  nullForEmpty?: boolean           // 空单元格转为 null
  headerRowIndex?: number          // 表头行索引，默认 0
  dataStartRowIndex?: number       // 数据起始行，默认 1
  selectedSheetIndexes?: number[]  // 选中的 Sheet 索引（多选）
}

// 解析结果
export interface ExcelParseResult {
  // 单 Sheet 选中: 返回数组
  // 多 Sheet 选中: 返回对象
  data: any[] | Record<string, any[]>
  sheets: SheetInfo[]
  selectedSheets: SheetInfo[]
}

// 合并单元格信息
interface MergeRange {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
  value: any
}
```

#### 新增/修改函数

##### 1. previewExcelSheets - 预览 Sheet 列表
```typescript
export async function previewExcelSheets(file: File): Promise<SheetInfo[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) throw new Error('文件读取失败')
        
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheets: SheetInfo[] = workbook.SheetNames.map((name, index) => {
          const worksheet = workbook.Sheets[name]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
          
          // 过滤空行后计算有效行数
          const validRows = jsonData.filter(row => 
            row.some(cell => cell !== undefined && cell !== null && cell !== '')
          )
          
          return {
            name,
            index,
            rowCount: Math.max(0, validRows.length - 1), // 减去表头
            isEmpty: validRows.length <= 1
          }
        })
        
        resolve(sheets)
      } catch (error) {
        reject(new Error('预览 Sheet 列表失败'))
      }
    }
    
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsBinaryString(file)
  })
}
```

##### 2. parseExcelFile - 解析 Excel（v2 核心）
```typescript
export async function parseExcelFile(
  file: File, 
  options: ExcelParseOptions = {}
): Promise<ExcelParseResult> {
  const {
    nullForEmpty = false,
    headerRowIndex = 0,
    dataStartRowIndex = 1,
    selectedSheetIndexes = [0]
  } = options

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) throw new Error('文件读取失败')
        
        const workbook = XLSX.read(data, { type: 'binary' })
        const allSheets = workbook.SheetNames.map((name, index) => ({
          name,
          index,
          worksheet: workbook.Sheets[name]
        }))
        
        // 过滤选中的 Sheets
        const selectedSheets = allSheets.filter(s => 
          selectedSheetIndexes.includes(s.index)
        )
        
        if (selectedSheets.length === 0) {
          throw new Error('未选择任何工作表')
        }
        
        // 解析每个选中的 Sheet
        const parsedData: Record<string, any[]> = {}
        
        selectedSheets.forEach(({ name, worksheet }) => {
          parsedData[name] = parseWorksheetWithMerges(
            worksheet, 
            nullForEmpty,
            headerRowIndex,
            dataStartRowIndex
          )
        })
        
        // 根据选择数量决定返回格式
        const result = selectedSheets.length === 1
          ? parsedData[selectedSheets[0].name]  // 单选返回数组
          : parsedData                           // 多选返回对象
        
        resolve({
          data: result,
          sheets: allSheets.map(s => ({
            name: s.name,
            index: s.index,
            rowCount: 0, // 简化处理
            isEmpty: false
          })),
          selectedSheets: selectedSheets.map(s => ({
            name: s.name,
            index: s.index,
            rowCount: 0,
            isEmpty: false
          }))
        })
        
      } catch (error: any) {
        reject(new Error(`解析失败: ${error.message}`))
      }
    }
    
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsBinaryString(file)
  })
}
```

##### 3. parseWorksheetWithMerges - 解析工作表（含合并单元格处理）
```typescript
function parseWorksheetWithMerges(
  worksheet: XLSX.WorkSheet,
  nullForEmpty: boolean,
  headerRowIndex: number,
  dataStartRowIndex: number
): any[] {
  // 1. 获取合并单元格信息
  const merges = worksheet['!merges'] || []
  
  // 2. 构建合并单元格值映射表
  const mergeMap = new Map<string, any>()
  
  merges.forEach((merge: XLSX.Range) => {
    const { s, e } = merge  // start, end
    const masterCell = worksheet[XLSX.utils.encode_cell(s)]
    const masterValue = masterCell ? masterCell.v : null
    
    // 将合并区域的所有单元格映射到主单元格的值
    for (let row = s.r; row <= e.r; row++) {
      for (let col = s.c; col <= e.c; col++) {
        mergeMap.set(`${row},${col}`, masterValue)
      }
    }
  })
  
  // 3. 确定数据范围
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
  const maxRow = range.e.r
  const maxCol = range.e.c
  
  // 4. 读取表头
  const headers: string[] = []
  for (let col = 0; col <= maxCol; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: headerRowIndex, c: col })
    const cell = worksheet[cellRef]
    const headerValue = cell ? String(cell.v || '') : ''
    
    // 检查是否在合并区域
    const mergeValue = mergeMap.get(`${headerRowIndex},${col}`)
    const finalHeader = headerValue || (mergeValue !== undefined ? String(mergeValue) : '')
    
    // 空表头使用默认列名
    headers.push(finalHeader || `Column${col + 1}`)
  }
  
  // 5. 读取数据行
  const results: any[] = []
  
  for (let row = dataStartRowIndex; row <= maxRow; row++) {
    const rowData: Record<string, any> = {}
    let hasData = false
    
    for (let col = 0; col <= maxCol; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
      const cell = worksheet[cellRef]
      
      // 优先使用合并映射的值
      const mergeValue = mergeMap.get(`${row},${col}`)
      let value: any
      
      if (mergeValue !== undefined) {
        value = mergeValue
      } else if (cell) {
        value = cell.v
        hasData = true
      } else {
        value = nullForEmpty ? null : ''
      }
      
      // 跳过主单元格被其他行使用的标记
      // 实际值已经被 mergeMap 处理
      
      rowData[headers[col]] = value
    }
    
    // 只保留非空行（可选）
    if (hasData || Object.values(rowData).some(v => v !== null && v !== '')) {
      results.push(rowData)
    }
  }
  
  return results
}
```

##### 4. 保留现有函数（兼容 v1.4）
- `isExcelFile()` - 保持不变
- `canExportToExcel()` - 保持不变
- `exportToExcel()` - 保持不变
- `readExcelFile()` - 标记为 @deprecated，内部调用 parseExcelFile

---

## 数据流设计

### Excel 导入流程

```
用户操作
    │
    ├─► 点击"导入 Excel" 或拖拽文件
    │
    ▼
检测文件类型
    │
    ├─► 非 Excel → 错误提示
    │
    ▼
预览 Sheet 列表
    │
    ├─► 调用 previewExcelSheets(file)
    │
    ▼
判断 Sheet 数量
    │
    ├─► 1 个 Sheet ──────────────────┐
    │                                │
    ├─► 多个 Sheet                   │
    │       │                        │
    │       ▼                        │
    │   显示 SheetSelectorDialog     │
    │       │                        │
    │       ├─► 用户选择 Sheet(s)    │
    │       │                        │
    │       ├─► 点击"确认"           │
    │       │                        │
    │       └─► 点击"取消" → 结束   │
    │                                │
    ▼                                ▼
调用 parseExcelFile() ◄─────────────┘
    │
    ├─► 解析选中的 Sheet(s)
    ├─► 处理合并单元格
    │
    ▼
生成 JSON
    │
    ├─► 单 Sheet → 数组格式
    ├─► 多 Sheet → 对象格式
    │
    ▼
填充到输入区
    │
    ▼
自动格式化显示
```

---

## 算法详解

### 合并单元格处理算法

**输入**: Excel Worksheet (XLSX.WorkSheet)
**输出**: JSON 对象数组

```
算法: ParseWorksheetWithMerges
─────────────────────────────

1. 提取合并区域信息
   merges ← worksheet['!merges'] || []

2. 构建合并值映射表
   mergeMap ← 空 Map
   
   对于每个 merge 在 merges 中:
       masterCell ← worksheet[encode_cell(merge.s)]
       masterValue ← masterCell ? masterCell.v : null
       
       对于 row 从 merge.s.r 到 merge.e.r:
           对于 col 从 merge.s.c 到 merge.e.c:
               mergeMap[key(row, col)] ← masterValue

3. 读取表头
   headers ← []
   range ← decode_range(worksheet['!ref'])
   
   对于 col 从 0 到 range.e.c:
       cellRef ← encode_cell({r: headerRowIndex, c: col})
       cell ← worksheet[cellRef]
       header ← cell ? cell.v : mergeMap[key(headerRowIndex, col)]
       headers.push(header || `Column${col+1}`)

4. 读取数据行
   results ← []
   
   对于 row 从 dataStartRowIndex 到 range.e.r:
       rowData ← {}
       hasData ← false
       
       对于 col 从 0 到 range.e.c:
           // 优先使用合并值
           如果 mergeMap 包含 key(row, col):
               value ← mergeMap[key(row, col)]
           否则如果 worksheet 包含 cellRef:
               value ← worksheet[cellRef].v
               hasData ← true
           否则:
               value ← nullForEmpty ? null : ''
           
           rowData[headers[col]] ← value
       
       如果 hasData 或行非空:
           results.push(rowData)

5. 返回 results
```

**复杂度分析**:
- 时间复杂度: O(R × C)，R=行数, C=列数
- 空间复杂度: O(R × C)，用于存储 mergeMap 和结果

**优化策略**:
- 延迟加载：只有实际需要时才解析大合并区域
- 流式处理：对于超大文件（>10000行），考虑分批处理

---

## 文件结构

```
src/
├── components/
│   └── toolbox/
│       ├── ToolCard.vue              (已有)
│       ├── JsonEditor.vue            (已有)
│       ├── ImageDropZone.vue         (已有)
│       └── SheetSelectorDialog.vue   (新增) ★
├── utils/
│   └── excel.ts                      (修改) ★ 扩展合并单元格支持
├── views/
│   └── tools/
│       ├── JsonToolView.vue          (修改) ★ 集成多 Sheet 选择
│       └── ImageBase64ToolView.vue   (已有)
└── types/
    └── excel.ts                      (可选) 类型定义提取
```

---

## 实现阶段

### Phase 1: 核心工具函数 (2-3h)
**负责人**: Backend/Frontend Agent

任务:
1. 扩展 `excel.ts` 类型定义
2. 实现 `previewExcelSheets()`
3. 实现 `parseWorksheetWithMerges()` 核心算法
4. 重构 `parseExcelFile()` 支持多 Sheet 选择
5. 单元测试：合并单元格场景

验收:
- [ ] 垂直合并正确处理
- [ ] 水平合并正确处理
- [ ] 复杂合并正确处理
- [ ] 多 Sheet 解析正常

### Phase 2: Sheet 选择器组件 (2h)
**负责人**: Frontend Agent

任务:
1. 创建 `SheetSelectorDialog.vue`
2. 实现复选框列表 + 全选功能
3. 实现实时预览（已选数量 + 输出格式）
4. 空 Sheet 警告提示

验收:
- [ ] UI 符合设计稿
- [ ] 多选/全选功能正常
- [ ] 空 Sheet 显示警告
- [ ] 至少选一个才能确认

### Phase 3: 集成与联调 (2h)
**负责人**: Frontend Agent

任务:
1. 修改 `JsonToolView.vue` 导入流程
2. 集成 SheetSelectorDialog
3. 处理导入错误（损坏文件、非 Excel 等）
4. 拖拽文件流程同步更新

验收:
- [ ] 单 Sheet 直接导入
- [ ] 多 Sheet 弹出选择器
- [ ] 选择后正确导入
- [ ] 取消操作正常
- [ ] 拖拽文件支持

### Phase 4: 测试验收 (2h)
**负责人**: Tester Agent

任务:
1. 功能测试（按 PRD 验收标准）
2. 边界情况测试（空 Sheet、损坏文件等）
3. 性能测试（大文件、大合并区域）
4. 兼容性测试（不同 Excel 版本）

---

## 技术决策

### 决策 1: 为什么合并单元格采用"填充"策略而非其他方案？

**选项对比**:
| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 填充值到所有行 | 数据完整、逻辑简单 | 数据冗余 |
| B. 保持嵌套结构 | 节省空间 | 增加解析复杂度，破坏平面化结构 |
| C. 仅保留主单元格 | 无冗余 | 数据丢失 |

**选择**: 方案 A
**理由**: 数据完整性优先，符合用户"1对多关系"的需求描述

### 决策 2: 为什么反向转换不生成合并单元格？

**理由**:
1. **无法准确判断**: 无法区分"应该合并"和"恰好相同"
2. **可逆性**: 避免 A→B→A 过程中引入不可逆转换
3. **渐进原则**: 样式恢复是进阶需求，本期不做

### 决策 3: 单 Sheet 选中返回数组而非对象？

**理由**:
1. **简化使用**: 用户通常只需要处理单个表格数据
2. **兼容性**: 保持与 v1.4 行为一致
3. **明确语义**: 对象格式明确表示"多个 Sheet"

---

## 风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| 合并单元格解析性能差 | 中 | 高 | 对大合并区域添加进度提示 |
| xlsx 库解析异常 Excel 报错 | 中 | 中 | try-catch 包装，友好错误提示 |
| 内存溢出（超大文件） | 低 | 高 | 建议文件大小限制（10MB） |
| Sheet 名称含特殊字符 | 低 | 中 | JSON key 合法化转义 |

---

## 依赖清单

```json
{
  "dependencies": {
    "xlsx": "^0.18.5"  // 已存在
  }
}
```

---

## 验收检查清单

### 架构设计验收
- [ ] 组件设计覆盖所有 PRD 需求
- [ ] 算法逻辑清晰，可维护
- [ ] 类型定义完整
- [ ] 文件结构合理
- [ ] 实现阶段可执行

### 技术可行性
- [ ] xlsx 库支持所需功能（已验证）
- [ ] 纯前端实现可行
- [ ] 性能满足需求（预估）

---

## 参考文档

- PRD: `docs/prd/toolbox-excel-json-v2.md`
- v1.4 架构: `docs/archive/v1.4-excel-json/architect-output.md`
- 现有实现: `src/utils/excel.ts`, `src/views/tools/JsonToolView.vue`

---

## 下一步

架构设计已完成，可进入 **Phase 1** 实现阶段。

等待指派 Frontend Agent 开始开发。
