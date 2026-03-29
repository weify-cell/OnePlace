# 前端开发输出 - Excel/JSON 格式转换 v2

## 迭代信息

| 字段 | 值 |
|------|-----|
| 版本号 | v1.5 |
| 模块标识 | toolbox-excel-json-v2 |
| 迭代目标 | 重新设计Excel/JSON转换格式，支持合并单元格1对多转换 |
| 完成日期 | 2026-03-29 |

---

## 已完成工作

### 1. 扩展 Excel 工具模块
**文件**: `src/utils/excel.ts`

新增类型：
- `SheetInfo` - Sheet 信息（name, index, rowCount, isEmpty）
- `ExcelParseOptions` - 解析选项
- `ExcelParseResult` - 解析结果

新增函数：
- `previewExcelSheets(file: File): Promise<SheetInfo[]>` - 预览 Sheet 列表
- `parseWorksheetWithMerges()` - 核心合并单元格展开算法
- `parseExcelFile(file, options): Promise<ExcelParseResult>` - 支持多 Sheet 选择

标记废弃：
- `readExcelFile()` - 标记为 @deprecated，请使用 `parseExcelFile`

### 2. 新增 Sheet 选择器组件
**文件**: `src/components/toolbox/SheetSelectorDialog.vue`

功能：
- 复选框多选 + 全选功能
- 空 Sheet 警告标签
- 实时预览已选数量和输出格式

### 3. 修改 JSON 工具页面
**文件**: `src/views/tools/JsonToolView.vue`

修改导入流程：
1. 预览所有 Sheet
2. 单 Sheet → 直接导入
3. 多 Sheet → 弹出选择器 → 用户选择后导入

---

## 合并单元格处理算法

```
1. 提取 worksheet['!merges'] 中的合并区域
2. 构建 mergeMap：每个单元格坐标 → 合并主单元格的值
3. 读取表头（支持表头合并）
4. 读取数据行时，优先使用 mergeMap 中的值
5. 返回 JSON 对象数组
```

---

## 数据结构转换规则

### Excel → JSON
| 场景 | 输出格式 |
|------|----------|
| 单 Sheet 选中 | 数组 `[{...}, {...}]` |
| 多 Sheet 选中 | 对象 `{Sheet1: [...], Sheet2: [...]}` |
| 合并单元格 | 向下/向右填充值 |

### JSON → Excel
- 数组格式 → 单 Sheet
- 对象格式 → 多 Sheet
- **不恢复合并单元格**（保持简单）

---

## 文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/utils/excel.ts` | 扩展 | 新增合并单元格处理函数 |
| `src/components/toolbox/SheetSelectorDialog.vue` | 新增 | 多 Sheet 选择对话框 |
| `src/views/tools/JsonToolView.vue` | 修改 | 集成新导入流程 |

---

## 测试结果

- 单元测试：31 passed
- 类型检查：vue-tsc 通过
- 代码审查：通过

---

## 注意事项

- 纯前端实现，无需后端 API
- xlsx 库已存在于依赖中
- 原有 JSON 功能完全不受影响
