import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Project root is 2 levels up from server/src/services/
const PROJECT_ROOT = path.resolve(__dirname, '../../../')

// Uploads directory path
const UPLOADS_DIR = path.resolve(PROJECT_ROOT, 'uploads')

export interface UploadResult {
  url: string
  filename: string
}

// Ensure uploads directory exists
function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }
}

// Save uploaded file and return the relative URL
export function saveUploadedFile(file: Express.Multer.File): UploadResult {
  ensureUploadsDir()

  const ext = path.extname(file.originalname).toLowerCase() || '.png'
  const filename = `${crypto.randomUUID()}${ext}`
  const filepath = path.join(UPLOADS_DIR, filename)

  fs.writeFileSync(filepath, file.buffer)
  return {
    url: `/uploads/${filename}`,
    filename
  }
}

// Check if a file exists in uploads directory
export function fileExists(filename: string): boolean {
  const filepath = path.join(UPLOADS_DIR, filename)
  return fs.existsSync(filepath)
}

// Delete a file from uploads directory
export function deleteFile(filename: string): boolean {
  const filepath = path.join(UPLOADS_DIR, filename)
  if (!fs.existsSync(filepath)) {
    return false
  }
  fs.unlinkSync(filepath)
  return true
}

// Parse image URLs from markdown content and return filenames that exist in uploads
export function parseImagesFromContent(content: string): string[] {
  const imageRegex = /!\[.*?\]\(\/uploads\/([^)]+)\)/g
  const filenames: string[] = []
  let match

  while ((match = imageRegex.exec(content)) !== null) {
    filenames.push(match[1])
  }

  return filenames
}

// Get note images info
export function getNoteImages(noteId: number, content: string): { filename: string; url: string; used_in_content: boolean }[] {
  const usedFilenames = parseImagesFromContent(content)

  if (usedFilenames.length === 0) {
    return []
  }

  // Check which files actually exist
  const result: { filename: string; url: string; used_in_content: boolean }[] = []
  for (const filename of usedFilenames) {
    const exists = fileExists(filename)
    if (exists) {
      result.push({
        filename,
        url: `/uploads/${filename}`,
        used_in_content: true
      })
    }
  }

  return result
}
