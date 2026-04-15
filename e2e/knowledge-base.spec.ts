import { test, expect } from '@playwright/test'

test.describe('Knowledge Base E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('http://localhost:5173/login')
    await page.waitForTimeout(1000)
  })

  test('KB-01: Knowledge base config section in Settings', async ({ page }) => {
    await page.goto('http://localhost:5173/settings')
    await page.waitForTimeout(1000)

    // Scroll to find knowledge base section
    const kbSection = page.locator('text=知识库配置')
    await expect(kbSection).toBeVisible({ timeout: 5000 })

    // Check KB fields exist
    await expect(page.locator('text=启用知识库功能')).toBeVisible()
    await expect(page.locator('text=Embedding 服务商')).toBeVisible()
    await expect(page.locator('text=Qdrant 地址')).toBeVisible()
    await expect(page.locator('text=Collection')).toBeVisible()
  })

  test('KB-02: Knowledge base button in Chat header', async ({ page }) => {
    await page.goto('http://localhost:5173/chat')
    await page.waitForTimeout(1000)

    // Create new conversation if none exists
    const newBtn = page.locator('button:has-text("新对话")')
    if (await newBtn.isVisible()) {
      await newBtn.click()
      await page.waitForTimeout(500)
    }

    // Find KB button (📚) in chat header
    const kbBtn = page.locator('.chat-header__kb-btn')
    await expect(kbBtn).toBeVisible({ timeout: 5000 })
  })

  test('KB-03: Knowledge base panel opens on button click', async ({ page }) => {
    await page.goto('http://localhost:5173/chat')
    await page.waitForTimeout(1000)

    // Create new conversation
    const newBtn = page.locator('button:has-text("新对话")')
    if (await newBtn.isVisible()) {
      await newBtn.click()
      await page.waitForTimeout(500)
    }

    // Click KB button
    const kbBtn = page.locator('.chat-header__kb-btn')
    await kbBtn.click()
    await page.waitForTimeout(500)

    // Panel should appear
    const panel = page.locator('.kb-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=知识库设置')).toBeVisible()
  })

  test('KB-04: Toggle knowledge base on conversation', async ({ page }) => {
    await page.goto('http://localhost:5173/chat')
    await page.waitForTimeout(1000)

    // Create new conversation
    const newBtn = page.locator('button:has-text("新对话")')
    if (await newBtn.isVisible()) {
      await newBtn.click()
      await page.waitForTimeout(500)
    }

    // Open KB panel
    const kbBtn = page.locator('.chat-header__kb-btn')
    await kbBtn.click()
    await page.waitForTimeout(500)

    // Find and toggle the KB switch
    const kbSwitch = page.locator('.kb-panel .n-switch')
    const isChecked = await kbSwitch.locator('input').isChecked().catch(() => false)

    // Toggle
    await kbSwitch.click()
    await page.waitForTimeout(1000)

    // Verify tooltip changed
    const tooltip = page.locator('.chat-header__kb-btn + .n-tooltip').first()
    if (!isChecked) {
      await expect(page.locator('text=知识库：已启用')).toBeVisible()
    }
  })

  test('KB-05: Top K slider in knowledge base panel', async ({ page }) => {
    await page.goto('http://localhost:5173/chat')
    await page.waitForTimeout(1000)

    // Create new conversation
    const newBtn = page.locator('button:has-text("新对话")')
    if (await newBtn.isVisible()) {
      await newBtn.click()
      await page.waitForTimeout(500)
    }

    // Open KB panel
    const kbBtn = page.locator('.chat-header__kb-btn')
    await kbBtn.click()
    await page.waitForTimeout(500)

    // Check Top K slider exists
    const topKLabel = page.locator('text=Top K')
    await expect(topKLabel).toBeVisible()
  })

  test('KB-06: Save knowledge base settings', async ({ page }) => {
    await page.goto('http://localhost:5173/chat')
    await page.waitForTimeout(1000)

    // Create new conversation
    const newBtn = page.locator('button:has-text("新对话")')
    if (await newBtn.isVisible()) {
      await newBtn.click()
      await page.waitForTimeout(500)
    }

    // Open KB panel
    const kbBtn = page.locator('.chat-header__kb-btn')
    await kbBtn.click()
    await page.waitForTimeout(500)

    // Click save button
    const saveBtn = page.locator('button:has-text("保存")')
    await saveBtn.click()
    await page.waitForTimeout(1000)

    // Success message should appear
    await expect(page.locator('text=知识库设置已保存')).toBeVisible({ timeout: 5000 })
  })
})
