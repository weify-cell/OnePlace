import { Router } from 'express'
import multer from 'multer'
import { uploadImage, deleteImage, uploadNoteFile } from '../controllers/upload.controller.js'

const upload = multer({ storage: multer.memoryStorage() })
export const uploadRouter = Router()

// POST /api/upload - upload single image
uploadRouter.post('/', upload.single('file'), uploadImage)

// POST /api/upload/note - upload .txt/.md file as note
uploadRouter.post('/note', upload.single('file'), uploadNoteFile)

// DELETE /api/upload/:filename - delete image file
uploadRouter.delete('/:filename', deleteImage)
