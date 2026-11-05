import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Chờ lần kiểm tra Claude CLI lúc mở app xong. Máy không có CLI (như CI) bị chuyển tới /claude ngay sau
 * đó — điều hướng trước lúc này thì trang đích bị kéo đi. Phải chờ phần tử HIỆN RA trước: `not.toContainText`
 * trên phần tử chưa tồn tại (app còn đang tải) pass ngay lập tức.
 */
export async function waitForStartup(page: Page): Promise<void> {
  await page.evaluate(() => (window.location.hash = '#/claude'))
  const status = page.getByTestId('cli-status')
  await expect(status).toBeVisible({ timeout: 30_000 })
  await expect(status).not.toContainText(/Đang kiểm tra/, { timeout: 30_000 })
}

/** Điều hướng tới `hash` và chắc chắn trang đích đứng yên (thử lại nếu bị chuyển trang chen ngang). */
export async function goTo(page: Page, hash: string, ready: Locator): Promise<void> {
  await expect(async () => {
    await page.evaluate((h) => (window.location.hash = h), hash)
    await expect(ready).toBeVisible({ timeout: 3_000 })
    expect(await page.evaluate(() => window.location.hash)).toBe(hash)
  }).toPass({ timeout: 30_000 })
}
