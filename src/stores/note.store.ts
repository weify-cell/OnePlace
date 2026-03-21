import { defineStore } from 'pinia'
import { notesApi } from '@/api/notes.api'
import type { Note } from '@/types'

export const useNoteStore = defineStore('notes', () => {
  const items = ref<Note[]>([])
  const total = ref(0)
  const currentNote = ref<Note | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const allTags = ref<string[]>([])
  const filters = ref({ tag: '', search: '', is_archived: false, is_pinned: undefined as boolean | undefined })

  async function fetchNotes() {
    loading.value = true
    try {
      const params: Record<string, unknown> = { is_archived: filters.value.is_archived }
      if (filters.value.tag) params.tag = filters.value.tag
      if (filters.value.search) params.search = filters.value.search
      if (filters.value.is_pinned !== undefined) params.is_pinned = filters.value.is_pinned
      const res = await notesApi.getAll(params)
      items.value = res.data.items
      total.value = res.data.total
    } finally {
      loading.value = false
    }
  }

  async function createNote() {
    const res = await notesApi.create()
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

  async function toggleArchive(id: number) {
    const note = items.value.find(n => n.id === id) || currentNote.value
    if (!note) return
    return updateNote(id, { is_archived: !note.is_archived })
  }

  async function fetchAllTags() {
    const res = await notesApi.getTags()
    allTags.value = res.data
  }

  return { items, total, currentNote, loading, saving, allTags, filters, fetchNotes, createNote, fetchNote, updateNote, deleteNote, togglePin, toggleArchive, fetchAllTags }
})
