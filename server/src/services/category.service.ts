import { connectDatabase } from '../database/index.js'

/**
 * 分类模块（按类型参数化）。
 *
 * 工具分类与技能分类此前是两对逐字重复的 service/controller（除表名外完全一致），
 * 而唯一真正的业务规则——「有子项的分类不允许删除」——只在两个 Vue 视图里各写一遍。
 * 后端直接删除时，调用方拿到的是裸的 SQLite 外键约束错误。
 *
 * 现在：规则跟着删除走，接口保持 {list, create, update, remove}，前端契约字段名不变。
 *
 * 注：表名/列名来自本文件的常量（非用户输入），拼接进 SQL 是安全的。
 */

/** 一种分类的存储布局。 */
export interface CategoryKind {
  /** 分类表名 */
  categoryTable: string
  /** 子项表名 */
  itemTable: string
  /** 子项指向分类的外键列 */
  itemForeignKey: string
  /** 列表里子项计数的字段名（保持既有前端契约：tool_count / skill_count） */
  countField: string
  /** 子项的中文名，用于拒绝删除时的提示 */
  itemLabel: string
}

export const TOOL_CATEGORY: CategoryKind = {
  categoryTable: 'tool_categories',
  itemTable: 'tools',
  itemForeignKey: 'category_id',
  countField: 'tool_count',
  itemLabel: '工具'
}

export const SKILL_CATEGORY: CategoryKind = {
  categoryTable: 'skills_categories',
  itemTable: 'skills',
  itemForeignKey: 'category_id',
  countField: 'skill_count',
  itemLabel: '技能'
}

export interface CategoryInput {
  name?: string
  description?: string
}

/** 删除结果：把「有子项」作为一等结果返回，而不是让调用方去解析数据库错误。 */
export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'has_children'; name: string; itemCount: number }

type Row = Record<string, unknown>

/** 列出全部分类，并带上各自的子项计数。 */
export function listCategories(kind: CategoryKind): Row[] {
  const db = connectDatabase()
  return db.prepare(`
    SELECT c.*, COUNT(i.id) AS ${kind.countField}
    FROM ${kind.categoryTable} c
    LEFT JOIN ${kind.itemTable} i ON i.${kind.itemForeignKey} = c.id
    GROUP BY c.id ORDER BY c.id ASC
  `).all() as Row[]
}

/** 某分类下的子项数量。 */
export function countItems(kind: CategoryKind, categoryId: number): number {
  const db = connectDatabase()
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM ${kind.itemTable} WHERE ${kind.itemForeignKey} = ?`
  ).get(categoryId) as { c: number }
  return row.c
}

function getRow(kind: CategoryKind, id: number): Row | null {
  const db = connectDatabase()
  return (db.prepare(`SELECT * FROM ${kind.categoryTable} WHERE id = ?`).get(id) as Row | undefined) ?? null
}

export function createCategory(kind: CategoryKind, data: CategoryInput): Row {
  const db = connectDatabase()
  const result = db.prepare(
    `INSERT INTO ${kind.categoryTable} (name, description) VALUES (?, ?)`
  ).run(data.name ?? '', data.description ?? '')
  return getRow(kind, Number(result.lastInsertRowid)) as Row
}

export function updateCategory(kind: CategoryKind, id: number, data: CategoryInput): Row | null {
  const db = connectDatabase()
  if (!getRow(kind, id)) return null
  db.prepare(
    `UPDATE ${kind.categoryTable}
     SET name = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`
  ).run(data.name, data.description, id)
  return getRow(kind, id)
}

/**
 * 删除分类。不变式：仍有子项的分类不允许删除——
 * 规则在这里，而不是在每个调用方。
 */
export function deleteCategory(kind: CategoryKind, id: number): DeleteResult {
  const db = connectDatabase()
  const row = getRow(kind, id)
  if (!row) return { ok: false, reason: 'not_found' }

  const itemCount = countItems(kind, id)
  if (itemCount > 0) {
    return { ok: false, reason: 'has_children', name: String(row.name ?? ''), itemCount }
  }

  db.prepare(`DELETE FROM ${kind.categoryTable} WHERE id = ?`).run(id)
  return { ok: true }
}

/** 拒绝删除时的统一提示文案。 */
export function describeDeleteRefusal(kind: CategoryKind, name: string, itemCount: number): string {
  return `「${name}」下还有 ${itemCount} 个${kind.itemLabel}，无法删除`
}
