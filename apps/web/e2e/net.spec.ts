/**
 * M4 E2E：双浏览器上下文联机（同一浏览器两个 context = 两个独立存档域）。
 * 覆盖：建房/加入配对、互相拜访、赠送礼物、猜拳 commit-reveal。
 * 前置：web dev(5173) + signaling(8787)（配置里 reuseExistingServer）。
 */
import { expect, test } from '@playwright/test';

test('双端配对 → 拜访 → 礼物 → 猜拳全流程', async ({ browser }) => {
  test.setTimeout(90_000); // WebRTC 建连 + 多步交互，放宽用例超时
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // 预处理：不让首访帮助浮层挡路；拉开说明书抽屉（联机面板在抽屉里）
  for (const page of [a, b]) {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('tk-help-seen', '1'));
    await page.reload();
    await page.waitForFunction(() => Boolean((window as any).__pet));
    await page.locator('.drawer-tab').click();
  }

  // 降低爱心基数，让"+心"效果可断言
  await a.evaluate(() => {
    (window as any).__pet.pet.happinessHearts = 1;
  });
  await b.evaluate(() => {
    (window as any).__pet.pet.happinessHearts = 1;
  });

  // A 创建房间（房间号经信令服务器异步返回，需等待渲染）
  await a.getByRole('button', { name: '创建房间' }).click();
  await expect(a.locator('.big')).toHaveText(/^\d{6}$/, { timeout: 10_000 });
  const code = (await a.locator('.big').textContent())!.trim();

  // B 加入
  await b.locator('.code').fill(code);
  await b.getByRole('button', { name: '加入' }).click();

  // 双方收到 hello/hello_ack → 面板出现朋友卡片
  await expect(a.locator('.friend b')).toHaveText('小蛋', { timeout: 20_000 });
  await expect(b.locator('.friend b')).toHaveText('小蛋');

  // 拜访：A 发起 → 双方快乐 +1（1 → 2）
  await a.getByRole('button', { name: '拜访' }).click();
  await expect(a.locator('.journal li').first()).toContainText('双方快乐 +1', { timeout: 10_000 });
  await expect(b.locator('.journal li').first()).toContainText('来拜访');
  expect(await a.evaluate(() => (window as any).__pet.pet.happinessHearts)).toBe(2);
  expect(await b.evaluate(() => (window as any).__pet.pet.happinessHearts)).toBe(2);

  // 礼物：A 送零食 → B 快乐 +1（2 → 3）
  await a.getByRole('button', { name: '送零食' }).click();
  await expect(b.locator('.journal li').first()).toContainText('送来零食', { timeout: 10_000 });
  expect(await b.evaluate(() => (window as any).__pet.pet.happinessHearts)).toBe(3);

  // 猜拳：A 石头 vs B 剪刀 → A 胜（A +2 → 4；B +1 → 4）
  await a.getByRole('button', { name: '猜拳' }).click();
  await expect(b.locator('.rps')).toBeVisible({ timeout: 10_000 });
  await a.getByRole('button', { name: '石头' }).click();
  await b.getByRole('button', { name: '剪刀' }).click();
  await expect(a.locator('.journal li').first()).toContainText('猜拳赢了', { timeout: 10_000 });
  await expect(b.locator('.journal li').first()).toContainText('猜拳输给', { timeout: 10_000 });
  expect(await a.evaluate(() => (window as any).__pet.pet.happinessHearts)).toBe(4);
  expect(await b.evaluate(() => (window as any).__pet.pet.happinessHearts)).toBe(4);

  await ctxA.close();
  await ctxB.close();
});
