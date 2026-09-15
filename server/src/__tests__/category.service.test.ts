import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../database/index.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tool_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE skills_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES tool_categories(id)
    );
    CREATE TABLE skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES skills_categories(id)
    );
  `)
  db.pragma('foreign_keys = ON')
  return { connectDatabase: () => db }
})

import { connectDatabase } from '../database/index.js'
import {
  SKILL_CATEGORY,
  TOOL_CATEGORY,
  countItems,
  createCategory,
  deleteCategory,
  describeDeleteRefusal,
  listCategories,
  updateCategory
} from '../services/category.service.js'

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM tools').run()
  db.prepare('DELETE FROM skills').run()
  db.prepare('DELETE FROM tool_categories').run()
  db.prepare('DELETE FROM skills_categories').run()
})

describe('listCategories', () => {
  it('带上各自的子项计数，字段名沿用既有前端契约', () => {
    const db = connectDatabase()
    db.prepare("INSERT INTO tool_categories (id, name) VALUES (1, '笔记')").run()
    db.prepare("INSERT INTO tools (name, category_id) VALUES ('a', 1), ('b', 1)").run()
    db.prepare("INSERT INTO skills_categories (id, name) VALUES (1, '通用')").run()
    db.prepare("INSERT INTO skills (name, category_id) VALUES ('s', 1)").run()

    const toolCats = listCategories(TOOL_CATEGORY)
    expect(toolCats[0]).toMatchObject({ name: '笔记', tool_count: 2 })

    const skillCats = listCategories(SKILL_CATEGORY)
    expect(skillCats[0]).toMatchObject({ name: '通用', skill_count: 1 })
  })

  it('没有子项的分类计数为 0（LEFT JOIN 不丢分类）', () => {
    createCategory(TOOL_CATEGORY, { name: '空分类' })
    expect(listCategories(TOOL_CATEGORY)[0]).toMatchObject({ name: '空分类', tool_count: 0 })
  })
})

describe('createCategory / updateCategory', () => {
  it('创建后可读回；更新不存在的返回 null', () => {
    const created = createCategory(TOOL_CATEGORY, { name: 'A', description: 'desc' })
    expect(created).toMatchObject({ name: 'A', description: 'desc' })

    const updated = updateCategory(TOOL_CATEGORY, Number(created.id), { name: 'B', description: 'd2' })
    expect(updated).toMatchObject({ name: 'B', description: 'd2' })

    expect(updateCategory(TOOL_CATEGORY, 9999, { name: 'x' })).toBeNull()
  })

  it('两种类型互不干扰（写入工具分类不会出现在技能分类里）', () => {
    createCategory(TOOL_CATEGORY, { name: '仅工具' })
    expect(listCategories(SKILL_CATEGORY)).toHaveLength(0)
    expect(listCategories(TOOL_CATEGORY)).toHaveLength(1)
  })
})

describe('deleteCategory — 「有子项则拒绝删除」不变式', () => {
  it('有子项：返回 has_children（含名称与数量），不删除、不抛外键错误', () => {
    const db = connectDatabase()
    const cat = createCategory(TOOL_CATEGORY, { name: '笔记' })
    db.prepare("INSERT INTO tools (name, category_id) VALUES ('a', ?), ('b', ?)").run(cat.id, cat.id)

    const result = deleteCategory(TOOL_CATEGORY, Number(cat.id))
    expect(result).toEqual({ ok: false, reason: 'has_children', name: '笔记', itemCount: 2 })
    // 分类仍在，子项仍挂在它下面
    expect(listCategories(TOOL_CATEGORY)).toHaveLength(1)
    expect(countItems(TOOL_CATEGORY, Number(cat.id))).toBe(2)
  })

  it('不存在的分类：返回 not_found', () => {
    expect(deleteCategory(TOOL_CATEGORY, 9999)).toEqual({ ok: false, reason: 'not_found' })
  })

  it('空分类：删除成功，并真的从列表消失', () => {
    const cat = createCategory(TOOL_CATEGORY, { name: '空' })
    expect(deleteCategory(TOOL_CATEGORY, Number(cat.id))).toEqual({ ok: true })
    expect(listCategories(TOOL_CATEGORY)).toHaveLength(0)
  })

  it('技能分类走同一套规则', () => {
    const db = connectDatabase()
    const cat = createCategory(SKILL_CATEGORY, { name: '通用' })
    db.prepare("INSERT INTO skills (name, category_id) VALUES ('s', ?)").run(cat.id)

    expect(deleteCategory(SKILL_CATEGORY, Number(cat.id))).toMatchObject({
      ok: false, reason: 'has_children', itemCount: 1
    })
    expect(listCategories(SKILL_CATEGORY)).toHaveLength(1)
  })
})

describe('describeDeleteRefusal', () => {
  it('按类型给出可读文案', () => {
    expect(describeDeleteRefusal(TOOL_CATEGORY, '笔记', 4)).toBe('「笔记」下还有 4 个工具，无法删除')
    expect(describeDeleteRefusal(SKILL_CATEGORY, '通用', 1)).toBe('「通用」下还有 1 个技能，无法删除')
  })
})
