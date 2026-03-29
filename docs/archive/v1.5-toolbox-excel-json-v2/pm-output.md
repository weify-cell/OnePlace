# PM 输出 - Excel/JSON 格式转换规范 v2

## 迭代信息

| 字段 | 值 |
|------|-----|
| 版本号 | v1.5 |
| 模块标识 | toolbox-excel-json-v2 |
| 迭代目标 | 重新设计Excel/JSON转换格式，支持合并单元格1对多转换 |
| 依赖版本 | 基于v1.4 Excel/JSON功能升级 |
| 更新日期 | 2026-03-29 |

---

## 需求摘要

### 核心需求
重新设计Excel与JSON的转换规范，重点解决**合并单元格**的数据映射问题：

1. **合并单元格展开**：垂直/水平合并的单元格值需要复制填充到所有相关行
2. **多Sheet选择**：导入时支持选择**一个或多个**Sheet，多选时输出对象格式，单选时输出数组格式
3. **转换可逆**：确保数据不丢失，转换逻辑清晰

### 关键设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 合并单元格处理 | 向下/向右填充 | 数据完整性优先 |
| 反向转换合并 | 不生成合并单元格 | 避免误判，保持简单 |
| 多Sheet导入 | 复选框多选 | 灵活选择，输出格式自适应 |

---

## 功能范围

### 新增/改进功能

#### 1. Excel导入JSON（增强）
- **合并单元格展开**：合并区域的值自动填充到所有子单元格对应的数据行
- **多Sheet选择器**：检测多Sheet时弹出选择对话框
  - 使用**复选框**支持选择一个或多个Sheet
  - 只选一个Sheet → 输出数组 `[{...}, {...}]`（简化使用）
  - 选多个Sheet → 输出对象 `{ "Sheet1": [...], "Sheet2": [...] }`
- **空Sheet处理**：显示警告，允许选择，返回空数组

#### 2. JSON导出Excel（保持）
- 对象数组 → 单Sheet表格
- 嵌套对象 → 多Sheet表格
- **本期不生成合并单元格**（数据以独立单元格写入）

### 保持不变的原有功能
- v1.4 基础Excel/JSON转换功能
- JSON格式化、压缩、验证、转义等功能
- 拖拽上传支持

---

## 转换规则速览

### Excel → JSON

**垂直合并示例：**
```
| 部门  | 员工 |        JSON输出:
| 部门A | 张三 |        [{部门:"部门A",员工:"张三"},
|       | 李四 |  ---→   {部门:"部门A",员工:"李四"},
|       | 王五 |         {部门:"部门A",员工:"王五"}]
```

**多Sheet导入规则：**
- 选择**单个**Sheet → 输出数组 `[{...}, {...}]`（简化）
- 选择**多个**Sheet → 输出对象 `{ "Sheet1": [...], "Sheet2": [...] }`

### JSON → Excel

- 不恢复合并单元格（所有行独立）
- 连续相同值不会自动合并

---

## 本期不做清单

- Excel样式保留（颜色、字体、边框等）
- 复杂的Excel公式解析
- JSON转Excel时自动合并单元格
- CSV格式支持
- 批量多文件处理
- 后端存储或历史记录

---

## PRD文档位置

- 详细PRD：`docs/prd/toolbox-excel-json-v2.md`

---

## 接口概览

```typescript
// Excel转JSON
interface ExcelToJsonOptions {
  nullForEmpty?: boolean;
  headerRowIndex?: number;
  dataStartRowIndex?: number;
  selectedSheetIndexes?: number[];  // 多选支持
}

function parseExcelFile(file: File, options?: ExcelToJsonOptions): Promise<ExcelParseResult>;
function previewExcelSheets(file: File): Promise<SheetInfo[]>;

// JSON转Excel
function exportJsonToExcel(jsonData: JsonValue, options?: JsonToExcelOptions): Blob;
function downloadExcel(blob: Blob, fileName: string): void;
```

---

## 验收标准概要

1. 合并单元格垂直/水平展开正确
2. 多Sheet多选导入功能正常（选择多个输出对象格式）
3. 单Sheet选择导入输出数组格式
4. 空Sheet处理友好
5. 反向转换数据完整
6. 大文件处理性能达标（10MB/5秒内）

---

## 下一步

等待用户审阅PRD文档，确认后可以启动Architect Agent进行技术方案设计。
