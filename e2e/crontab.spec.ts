import { test, expect } from '@playwright/test'

test.describe('CrontabTool E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Dismiss any stale modal
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    // Login
    await page.goto('http://localhost:5173/login')
    await page.waitForTimeout(500)
    const passwordInput = page.getByRole('textbox', { name: '请输入密码' })
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('test123')
      await page.locator('button:has-text("登录")').click()
      await page.waitForURL('**/todos', { timeout: 10000 })
    }
    // Wait for and dismiss any modal that appears (e.g. "待办提醒")
    await page.waitForTimeout(500)
    const closeBtn = page.locator('.n-button:has-text("关闭")')
    if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await closeBtn.click()
      await page.waitForTimeout(300)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    // Navigate to crontab tool
    await page.goto('http://localhost:5173/toolbox/crontab')
    await expect(page.locator('text=Cron 表达式').first()).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 1: Parse standard cron expression 0 8 * * 1-5', async ({ page }) => {
    const input = page.locator('input').first()
    await input.fill('0 8 * * 1-5')
    await page.waitForTimeout(500)

    const explanation = page.locator('text=第0分钟')
    await expect(explanation).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=8点')).toBeVisible()
    await expect(page.locator('text=周一至周五')).toBeVisible()
  })

  test('Scenario 2: Parse step pattern */15', async ({ page }) => {
    const input = page.locator('input').first()
    await input.fill('*/15 * * * *')
    await page.waitForTimeout(500)

    await expect(page.locator('text=每15分钟')).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 3: Invalid format shows error', async ({ page }) => {
    const input = page.locator('input').first()
    await input.fill('abc')
    await page.waitForTimeout(500)

    await expect(page.locator('text=表达式格式有误')).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 6: Apply daily template', async ({ page }) => {
    await page.locator('button:has-text("每天")').click()
    await page.waitForTimeout(500)

    const input = page.locator('input').first()
    await expect(input).toHaveValue(/0 0 \* \* \*/)
  })

  test('Scenario 7: Apply weekly template', async ({ page }) => {
    await page.locator('button:has-text("每周一")').click()
    await page.waitForTimeout(500)

    const input = page.locator('input').first()
    await expect(input).toHaveValue(/0 0 \* \* 1/)
  })

  test('Scenario 8: Copy expression to clipboard', async ({ page }) => {
    const input = page.locator('input').first()
    await input.fill('0 8 * * 1-5')

    await page.locator('button:has-text("复制")').click()
    await page.waitForTimeout(500)

    const toast = page.locator('.n-notification')
    await expect(page.locator('text=已复制到剪贴板')).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 9: Reverse mode - generate daily cron', async ({ page }) => {
    await page.locator('button:has-text("时间 → Cron")').click()
    await page.waitForTimeout(500)

    await expect(page.locator('text=选择周期')).toBeVisible({ timeout: 5000 })

    // Select "每天" which has value -1
    const select = page.locator('.n-select')
    await select.click()
    await page.waitForTimeout(300)
    await page.locator('.n-base-select-option:has-text("每天")').click()
    await page.waitForTimeout(300)

    // Set hour to 8
    const hourInput = page.locator('.n-input-number').first().locator('input')
    await hourInput.fill('8')
    await page.waitForTimeout(300)

    // Set minute to 30
    const minuteInput = page.locator('.n-input-number').nth(1).locator('input')
    await minuteInput.fill('30')
    await page.waitForTimeout(500)

    // Should show generated cron
    await expect(page.locator('text=30 08')).toBeVisible({ timeout: 5000 })
  })

  test('Scenario 10: Reverse mode - generate weekly cron', async ({ page }) => {
    await page.locator('button:has-text("时间 → Cron")').click()
    await page.waitForTimeout(500)

    // Select "周一" which has value 1
    const select = page.locator('.n-select')
    await select.click()
    await page.waitForTimeout(300)
    await page.locator('.n-base-select-option:has-text("周一")').click()
    await page.waitForTimeout(300)

    // Set hour to 9
    const hourInput = page.locator('.n-input-number').first().locator('input')
    await hourInput.fill('9')
    await page.waitForTimeout(300)

    // Set minute to 0
    const minuteInput = page.locator('.n-input-number').nth(1).locator('input')
    await minuteInput.fill('0')
    await page.waitForTimeout(500)

    // Should show generated cron
    await expect(page.locator('text=00 09')).toBeVisible({ timeout: 5000 })
  })
})
