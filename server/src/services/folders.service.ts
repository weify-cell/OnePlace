import { connectDatabase } from '../database/index.js'

export interface Folder {
  id: number
  name: string
  created_at: string
  updated_at: string
}

interface FolderRow {
  id: number
  name: string
  is_deleted: number
  created_at: string
  updated_at: string
}

function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at
  }
}

export function getFolders(): Folder[] {
  const db = connectDatabase()
  const rows = db.prepare(
    `SELECT * FROM folders WHERE is_deleted = 0 ORDER BY created_at ASC`
  ).all() as FolderRow[]
  return rows.map(rowToFolder)
}

export function getFolderById(id: number): Folder | null {
  const db = connectDatabase()
  const row = db.prepare(
    `SELECT * FROM folders WHERE id = ? AND is_deleted = 0`
  ).get(id) as FolderRow | undefined
  return row ? rowToFolder(row) : null
}

export function createFolder(name: string): Folder {
  const db = connectDatabase()
  const result = db.prepare(
    `INSERT INTO folders (name) VALUES (?)`
  ).run(name)
  return getFolderById(result.lastInsertRowid as number)!
}

export function renameFolder(id: number, name: string): Folder | null {
  const db = connectDatabase()
  const existing = getFolderById(id)
  if (!existing) return null

  db.prepare(
    `UPDATE folders SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(name, id)
  return getFolderById(id)
}

export function deleteFolder(id: number): boolean {
  const db = connectDatabase()
  const existing = getFolderById(id)
  if (!existing) return false

  const txn = db.transaction(() => {
    // 将该文件夹下所有笔记的 folder_id 置 NULL
    db.prepare(
      `UPDATE notes SET folder_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE folder_id = ? AND is_deleted = 0`
    ).run(id)
    // 软删除文件夹
    db.prepare(
      `UPDATE folders SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(id)
  })

  txn()
  return true
}
