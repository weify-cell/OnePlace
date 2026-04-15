import { embedTexts } from '../ai/embedding-client.js'
import { upsertChunks, deleteChunksByNoteId, createCollectionIfNotExists } from './vector.service.js'
import { getSettingValue } from '../settings.service.js'
import { getEmbeddingDimension } from '../ai/embedding-client.js'
import type { Note } from '../notes.service.js'

interface EmbeddingTask {
  noteId: number
  action: 'upsert' | 'delete'
  timestamp: number
}

const taskQueue: EmbeddingTask[] = []
let isProcessing = false

function splitIntoChunks(text: string, chunkSize = 500, overlap = 50): string[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if (para.trim().length < 10) continue
    if (current.length + para.length + 2 <= chunkSize) {
      current += (current ? '\n\n' : '') + para
    } else {
      if (current) chunks.push(current)
      const overlapText = current.slice(-overlap)
      current = overlapText + (overlapText ? '\n\n' : '') + para
    }
  }
  if (current.trim()) chunks.push(current)
  return chunks
}

async function processTask(task: EmbeddingTask): Promise<void> {
  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'text-embedding-v2')
  const dimension = getEmbeddingDimension(provider, model)

  if (task.action === 'delete') {
    await deleteChunksByNoteId(task.noteId)
    return
  }

  // Dynamic import to avoid circular dependency
  const { getNoteById } = await import('../notes.service.js')
  const note = getNoteById(task.noteId)
  if (!note || note.is_deleted) {
    await deleteChunksByNoteId(task.noteId)
    return
  }

  const plainText = note.content_text || note.content.replace(/<[^>]+>/g, '')
  const texts = splitIntoChunks(plainText)
  if (texts.length === 0) {
    await deleteChunksByNoteId(task.noteId)
    return
  }

  await createCollectionIfNotExists(dimension)

  let vectors: number[][]
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      vectors = await embedTexts(texts, provider, model)
      break
    } catch (e) {
      if (attempt === 2) {
        console.error(`[embedding-queue] Failed to embed note ${task.noteId} after 3 attempts:`, e)
        return
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }

  const chunks = texts.map((content, index) => ({
    id: `note_${note.id}_${index}`,
    vector: vectors[index],
    payload: {
      chunk_id: `note_${note.id}_${index}`,
      note_id: note.id,
      title: note.title,
      content,
      tags: note.tags,
      folder_id: note.folder_id,
      created_at: note.created_at,
    }
  }))

  await upsertChunks(chunks)
}

async function processQueue(): Promise<void> {
  isProcessing = true
  while (taskQueue.length > 0) {
    const task = taskQueue.shift()
    if (task) {
      try {
        await processTask(task)
      } catch (e) {
        console.error(`[embedding-queue] Task failed for note ${task.noteId}:`, e)
      }
    }
  }
  isProcessing = false
}

export function enqueueEmbeddingTask(task: EmbeddingTask): void {
  const existingIdx = taskQueue.findIndex(t => t.noteId === task.noteId)
  if (existingIdx >= 0) {
    taskQueue.splice(existingIdx, 1)
  }
  taskQueue.push(task)
  if (!isProcessing) {
    processQueue().catch(console.error)
  }
}
