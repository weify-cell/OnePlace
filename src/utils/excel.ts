import * as XLSX from 'xlsx'

// ============= 类型定义 =============

/** Sheet 信息 */
export interface SheetInfo {
  name: string           // Sheet 名称
  index: number          // Sheet 索引
  rowCount: number       // 数据行数（不含表头）
  isEmpty: boolean       // 是否为空
}

/** Excel 解析选项 */
export interface ExcelParseOptions {
  nullForEmpty?: boolean           // 空单元格转为 null
  headerRowIndex?: number          // 表头行索引，默认 0
  dataStartRowIndex?: number       // 数据起始行，默认 1
  selectedSheetIndexes?: number[]  // 选中的 Sheet 索引（多选）
}

/** 解析结果 */
export interface ExcelParseResult {
  // 单 Sheet 选中: 返回数组
  // 多 Sheet 选中: 返回对象
  data: any[] | Record<string, any[]>
  sheets: SheetInfo[]
  selectedSheets: SheetInfo[]
}

/** 合并单元格信息 */
interface MergeRange {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
  value: any
}

// ============= 现有函数 =============

/**
 * 检查文件是否为 Excel 格式
 * @param file - 要检查的文件
 * @returns boolean
 */
export function isExcelFile(file: File): boolean {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream' // 某些 .xls 文件可能使用此类型
  ]
  const validExtensions = ['.xlsx', '.xls']

  const isValidType = validTypes.includes(file.type)
  const isValidExtension = validExtensions.some(ext =>
    file.name.toLowerCase().endsWith(ext)
  )

  return isValidType || isValidExtension
}

/**
 * 检查数据是否可以导出为 Excel
 * @param data - 要检查的数据
 * @returns boolean
 */
export function canExportToExcel(data: any): boolean {
  if (data === null || data === undefined) return false
  if (typeof data !== 'object') return false

  // 对象数组格式：[{...}, {...}] 或 [[...], [...]]
  if (Array.isArray(data)) {
    if (data.length === 0) return false
    // 二维数组 [[...], [...]]
    if (Array.isArray(data[0])) return true
    // 对象数组 [{...}, {...}] - 检查每个元素是否都是普通对象
    if (typeof data[0] === 'object' && data[0] !== null) return true
    return false
  }

  // 对象格式：每个值必须是数组
  const values = Object.values(data)
  if (values.length === 0) return false

  return values.every(value => Array.isArray(value))
}

/**
 * 预览 Excel 文件的 Sheet 列表
 * @param file - 用户上传的 Excel 文件
 * @returns Promise<SheetInfo[]> - Sheet 信息列表
 */
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

/**
 * 解析工作表（含合并单元格处理）
 * @param worksheet - XLSX 工作表
 * @param nullForEmpty - 空单元格转为 null
 * @param headerRowIndex - 表头行索引
 * @param dataStartRowIndex - 数据起始行索引
 * @returns 解析后的 JSON 对象数组
 */
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

      rowData[headers[col]] = value
    }

    // 只保留非空行
    if (hasData || Object.values(rowData).some(v => v !== null && v !== '')) {
      results.push(rowData)
    }
  }

  return results
}

/**
 * 解析 Excel 文件（支持多 Sheet 选择和合并单元格）
 * @param file - 用户上传的 Excel 文件
 * @param options - 解析选项
 * @returns Promise<ExcelParseResult> - 解析结果
 *
 * 转换规则：
 * - 单 Sheet 选中 → 返回数组 [{...}, {...}]
 * - 多 Sheet 选中 → 返回对象 {Sheet1: [...], Sheet2: [...]}
 */
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

        // 收集所有 Sheet 信息（用于返回）
        const sheets: SheetInfo[] = allSheets.map(s => {
          const worksheet = s.worksheet
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
          const validRows = jsonData.filter(row =>
            row.some(cell => cell !== undefined && cell !== null && cell !== '')
          )
          return {
            name: s.name,
            index: s.index,
            rowCount: Math.max(0, validRows.length - 1),
            isEmpty: validRows.length <= 1
          }
        })

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

        // 选中的 Sheet 信息
        const selectedSheetInfos = sheets.filter(s =>
          selectedSheetIndexes.includes(s.index)
        )

        // 根据选择数量决定返回格式
        const result = selectedSheets.length === 1
          ? parsedData[selectedSheets[0].name]  // 单选返回数组
          : parsedData                           // 多选返回对象

        resolve({
          data: result,
          sheets,
          selectedSheets: selectedSheetInfos
        })

      } catch (error: any) {
        reject(new Error(`解析失败: ${error.message}`))
      }
    }

    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsBinaryString(file)
  })
}

/**
 * 读取 Excel 文件并转换为 JSON
 * @param file - 用户上传的 Excel 文件
 * @returns Promise<any> - 转换后的 JSON 数据
 *
 * 转换规则：
 * - 多 Sheet → {Sheet1: [...], Sheet2: [...]}
 * - 单 Sheet → 直接返回二维数组
 * @deprecated 请使用 parseExcelFile 代替
 */
export async function readExcelFile(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          reject(new Error('文件读取失败'))
          return
        }

        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetNames = workbook.SheetNames

        // 多 Sheet 处理
        if (sheetNames.length > 1) {
          const result: Record<string, any[][]> = {}
          sheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName]
            result[sheetName] = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
          })
          resolve(result)
        } else {
          // 单 Sheet 简化处理
          const worksheet = workbook.Sheets[sheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
          resolve(jsonData)
        }
      } catch (error) {
        reject(new Error('文件读取失败，请检查文件是否损坏'))
      }
    }

    reader.onerror = () => {
      reject(new Error('文件读取失败，请检查文件是否损坏'))
    }

    reader.readAsBinaryString(file)
  })
}

/**
 * 将 JSON 数据导出为 Excel 文件
 * @param data - JSON 数据（数组或对象）
 * @param filename - 下载文件名（默认 export.xlsx）
 *
 * 转换规则：
 * - 对象数组 [{...}, {...}] → 单 Sheet
 * - 二维数组 [[...], [...]] → 单 Sheet
 * - 对象格式 {Sheet1: [...], Sheet2: [...]} → 多 Sheet
 */
export function exportToExcel(data: any, filename: string = 'export.xlsx'): void {
  if (!canExportToExcel(data)) {
    throw new Error('数据格式无效，无法导出')
  }

  const workbook = XLSX.utils.book_new()

  if (Array.isArray(data)) {
    let worksheet: XLSX.WorkSheet

    if (Array.isArray(data[0])) {
      // 二维数组 [[...], [...]]
      worksheet = XLSX.utils.aoa_to_sheet(data)
    } else {
      // 对象数组 [{...}, {...}] → 转换为二维数组
      worksheet = XLSX.utils.json_to_sheet(data)
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  } else {
    // 对象格式 → 多 Sheet
    Object.entries(data).forEach(([sheetName, sheetData]) => {
      const sheetArray = sheetData as any[]
      let worksheet: XLSX.WorkSheet

      if (Array.isArray(sheetArray[0])) {
        worksheet = XLSX.utils.aoa_to_sheet(sheetArray)
      } else {
        worksheet = XLSX.utils.json_to_sheet(sheetArray)
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    })
  }

  // 生成并下载文件
  XLSX.writeFile(workbook, filename)
}