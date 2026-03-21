import { Request, Response } from 'express'
import * as settingsService from '../services/settings.service.js'
import { AI_PROVIDERS } from '../services/ai/providers.js'

export function getAllSettings(req: Request, res: Response): void {
  const settings = settingsService.getAllSettings()
  settings.available_providers = Object.values(AI_PROVIDERS).map(p => ({
    name: p.name, displayName: p.displayName, models: p.models
  }))
  res.json(settings)
}

export function getSetting(req: Request, res: Response): void {
  const value = settingsService.getSetting(req.params.key)
  if (value === null) { res.status(404).json({ error: 'NotFound' }); return }
  try { res.json({ key: req.params.key, value: JSON.parse(value) }) }
  catch { res.json({ key: req.params.key, value }) }
}

export function setSetting(req: Request, res: Response): void {
  const { value } = req.body
  settingsService.setSetting(req.params.key, value)
  res.json({ key: req.params.key, value })
}
