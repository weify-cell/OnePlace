import type { Note } from '@/types'
import { api } from './index'

export const uploadApi = {
  uploadImage: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ url: string }>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  deleteImage: (filename: string) => api.delete(`/upload/${filename}`),
  uploadNoteFile: (file: File, folderId: number | null) => {
    const formData = new FormData()
    formData.append('file', file)
    if (folderId !== null) {
      formData.append('folder_id', String(folderId))
    }
    return api.post<Note>('/upload/note', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}
