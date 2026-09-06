/**
 * M3 E2E：刷新/关闭重开恢复状态、离线结算摘要、坏档守卫。
 * 前置：dev server 已就绪（配置里 reuseExistingServer）。
 * 注意：page.evaluate 的回调运行在浏览器端，Node 侧工具函数不可引用。
 */
import { expect, test } from '@playwright/test';

async function gotoFresh(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('tk-help-seen', '1')); // 不让首访帮助挡路
  await page.reload();
  await page.waitForFunction(() => Boolean((window as any).__pet));
}

test('刷新后状态与手账恢复（SaveFile v1 持久化）', async ({ page }) => {
  await gotoFresh(page);
  // 把蛋直接变成 child（近期时间戳，避免触发离线摘要）
  await page.evaluate(() => {
    const s = (window as any).__pet.pet;
    s.stage = 'child';
    s.characterId = 'child';
    s.updatedAt = Date.now();
  });
  await page.evaluate(() => (window as any).__pet.saveNow());
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('takumagako-save-v1') ?? '{}'));
  expect(saved.v).toBe(1);
  expect(saved.savedAt).toBeGreaterThan(0);
  expect(saved.settings).toEqual({ muted: false, shellColor: 'pink' });
  expect(saved.stats).toEqual({ friendsMet: 0 });

  await page.reload();
  await page.waitForFunction(() => (window as any).__pet?.pet?.stage === 'child');
  expect(await page.evaluate(() => (window as any).__pet.pet.stage)).toBe('child');
});

test('长时间离开 → 离线结算摘要弹窗', async ({ page }) => {
  await gotoFresh(page);
  // 种 child，把结算锚点拨回 2 小时前
  await page.evaluate(() => {
    const s = (window as any).__pet.pet;
    s.stage = 'child';
    s.characterId = 'child';
    s.sick = false;
    s.poops = 0;
    s.hungerHearts = 2;
    s.happinessHearts = 4;
    s.updatedAt = Date.now() - 2 * 3_600_000;
  });
  // 停掉旧页 tick（stop 会保存种子态），防止 reload 前 tick 把缺口当场结算掉
  await page.evaluate(() => (window as any).__pet.stop());
  await page.reload();
  await page.waitForFunction(() => Boolean((window as any).__pet));
  await expect(page.locator('.offline-sheet')).toBeVisible({ timeout: 5000 });
  const text = await page.locator('.offline-sheet').textContent();
  expect(text).toContain('你离开了');
  // 关闭弹窗，状态保持
  await page.locator('.offline-ok').click();
  await expect(page.locator('.offline-sheet')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__pet.pet.stage)).toBe('child');
});

test('坏档：备份到 tk-save-corrupt 并重新孵化', async ({ page }) => {
  await gotoFresh(page);
  // 先停掉旧页 tick，避免 beforeunload/节流存档把坏档覆盖回好档
  await page.evaluate(() => (window as any).__pet.stop());
  await page.evaluate(() => localStorage.setItem('takumagako-save-v1', '{"v":1,"pet":{"id":"x"}}'));
  await page.reload();
  await page.waitForFunction(() => Boolean((window as any).__pet));
  expect(await page.evaluate(() => (window as any).__pet.pet.stage)).toBe('egg');
  const corrupt = await page.evaluate(() => localStorage.getItem('takumagako-save-corrupt'));
  expect(corrupt).toBe('{"v":1,"pet":{"id":"x"}}');
});

test('快速刷新（<1 分钟）不弹离线摘要', async ({ page }) => {
  await gotoFresh(page);
  await page.evaluate(() => (window as any).__pet.saveNow());
  await page.reload();
  await page.waitForFunction(() => Boolean((window as any).__pet));
  await expect(page.locator('.offline-sheet')).toHaveCount(0);
});
