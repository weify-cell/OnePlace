import { defineStore } from 'pinia'
import { notesApi } from '@/api/notes.api'
import { foldersApi } from '@/api/folders.api'
import type { Note, Folder } from '@/types'

export const useNoteStore = defineStore('notes', () => {
  const items = ref<Note[]>([])
  const total = ref(0)
  const currentNote = ref<Note | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const allTags = ref<string[]>([])
  const folders = ref<Folder[]>([])
  const currentFolderId = ref<number | null>(null)
  const filters = ref({
    tag: '',
    search: '',
    is_archived: false,
    is_pinned: undefined as boolean | undefined,
    folder_id: null as number | null
  })

  async function fetchNotes() {
    loading.value = true
    try {
      const params: Record<string, unknown> = { is_archived: filters.value.is_archived }
      if (filters.value.tag) params.tag = filters.value.tag
      if (filters.value.search) params.search = filters.value.search
      if (filters.value.is_pinned !== undefined) params.is_pinned = filters.value.is_pinned
      if (filters.value.folder_id !== null) params.folder_id = filters.value.folder_id
      const res = await notesApi.getAll(params)
      items.value = res.data.items
      total.value = res.data.total
    } finally {
      loading.value = false
    }
  }

  async function createNote() {
    const payload: Record<string, unknown> = { content_format: 'markdown' }
    if (currentFolderId.value !== null) payload.folder_id = currentFolderId.value
    const res = await notesApi.create(payload)
    return res.data
  }

  async function fetchNote(id: number) {
    const res = await notesApi.getById(id)
    currentNote.value = res.data
    return res.data
  }

  async function updateNote(id: number, data: Partial<Note>) {
    saving.value = true
    try {
      const res = await notesApi.update(id, data)
      if (currentNote.value?.id === id) currentNote.value = res.data
      const idx = items.value.findIndex(n => n.id === id)
      if (idx !== -1) items.value[idx] = { ...items.value[idx], ...res.data }
      return res.data
    } finally {
      saving.value = false
    }
  }

  async function deleteNote(id: number) {
    await notesApi.delete(id)
    items.value = items.value.filter(n => n.id !== id)
    if (currentNote.value?.id === id) currentNote.value = null
  }

  async function togglePin(id: number) {
    const note = items.value.find(n => n.id === id) || currentNote.value
    if (!note) return
    return updateNote(id, { is_pinned: !note.is_pinned })
  }


  async function toggleKnowledgeBase(id: number) {
    const note = items.value.find(n => n.id === id) || currentNote.value
    if (!note) return
    return updateNote(id, { is_knowledge_base: !note.is_knowledge_base })
  }

  async function toggleArchive(id: number) {
    const note = items.value.find(n => n.id === id) || currentNote.value
    if (!note) return
    return updateNote(id, { is_archived: !note.is_archived })
  }

  async function fetchAllTags() {
    const res = await notesApi.getTags()
    allTags.value = res.data
  }

  // Folder actions
  async function fetchFolders() {
    const res = await foldersApi.getAll()
    folders.value = res.data.items
  }

  async function createFolder(name: string) {
    await foldersApi.create(name)
    await fetchFolders()
  }

  async function renameFolder(id: number, name: string) {
    const res = await foldersApi.rename(id, name)
    const idx = folders.value.findIndex(f => f.id === id)
    if (idx !== -1) folders.value[idx] = res.data
  }

  async function deleteFolder(id: number) {
    await foldersApi.delete(id)
    await fetchFolders()
    if (currentFolderId.value === id) {
      selectFolder(null)
    }
  }

  function selectFolder(id: number | null) {
    currentFolderId.value = id
    filters.value.folder_id = id
    fetchNotes()
  }

  return {
    items, total, currentNote, loading, saving, allTags,
    folders, currentFolderId, filters,
    fetchNotes, createNote, fetchNote, updateNote, deleteNote,
    togglePin, toggleArchive, fetchAllTags,toggleKnowledgeBase,
    fetchFolders, createFolder, renameFolder, deleteFolder, selectFolder
  }
})
