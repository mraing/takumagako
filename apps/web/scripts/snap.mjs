/**
 * CDP 视觉走查脚本：驱动各屏内画面并截图。
 * 用法：node scripts/snap.mjs [preset...]   （缺省跑全部 preset）
 * 依赖 dev server 运行于 http://localhost:5173。
 * 用临时 Chrome profile，不污染本机浏览器数据。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:5173/';
const PRESETS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['main', 'feed', 'meter', 'game', 'help', 'offline', 'dead', 'sleep', 'mobile', 'netsheet', 'shell'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'tk-chrome-'));
const proc = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=9333',
    '--remote-allow-origins=*',
    '--window-size=1280,860',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function findTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('CDP target not found');
}

const ws = new WebSocket(await findTarget());
let msgId = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');

async function evaluate(expression) {
  await send('Runtime.evaluate', { expression });
}

async function evalValue(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true });
  return res.result?.result?.value;
}

async function shot(name, width) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`/tmp/tk-s-${name}.png`, Buffer.from(res.result.data, 'base64'));
  console.log(`📸 /tmp/tk-s-${name}.png (${width ?? 1280}px)`);
}

/** 把 Date.now 拨到本地 targetHour（真实锚点只捕获一次，幂等） */
const shiftClock = (targetHour) => `(function(){
  if (!window.__RealNow) window.__RealNow = Date.now.bind(Date);
  const d = new Date();
  const target = new Date(d); target.setHours(${targetHour}, 0, 0, 0);
  let diff = target - d; if (diff < 0) diff += 24 * 3600 * 1000;
  Date.now = () => window.__RealNow() + diff;
})()`;

/** 在活页面上把宠物播种成指定阶段、满状态（直接改 store，无需 reload） */
const seed = (stage) => `(function(){
  const s = __pet.pet;
  s.stage = ${JSON.stringify(stage)}; s.characterId = ${JSON.stringify(stage)};
  s.stageSince = Date.now(); s.bornAt = Date.now() - 30 * 60000;
  s.sleeping = false; s.sick = false; s.sickSince = null; s.poops = 0; s.dirtySince = null;
  s.hungerHearts = 4; s.happinessHearts = 4; s.attention = 'none'; s.attentionSince = null;
  s.accHungerMs = 0; s.accHappyMs = 0; s.accPoopMs = 0; s.careMistakes = 0; s.snackStreak = 0;
  s.updatedAt = Date.now(); __pet.log.length = 0; __pet.notice = null;
})()`;

// 预热：种下"已读帮助"标记，避免各场景被首次帮助弹层遮挡
await send('Page.navigate', { url: URL });
await sleep(1200);
await evaluate(`localStorage.setItem('tk-help-seen','1')`);

for (const preset of PRESETS) {
  if (preset === 'mobile' || preset === 'netsheet') {
    // 移动端视口单独走查（新开 target）
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: URL });
    await sleep(1800);
    if (preset === 'netsheet') {
      await evaluate(`document.querySelector('.net-fab')?.click()`);
      await sleep(400);
    }
    await shot(preset, 390);
    await send('Emulation.clearDeviceMetricsOverride');
    continue;
  }
  await send('Page.navigate', { url: URL });
  await sleep(1500);
  switch (preset) {
    case 'main':
      break;
    case 'feed': // 播种 child → B 进喂食屏
      await evaluate(seed('child'));
      await sleep(300);
      await evaluate(`__pet.press('B')`);
      await sleep(400);
      break;
    case 'meter': // 状态页翻到爱心页
      await evaluate(`__pet.icon = 5; __pet.press('B')`);
      await sleep(200);
      await evaluate(`__pet.press('A'); __pet.press('A')`);
      await sleep(300);
      break;
    case 'help': // 打开"?"帮助浮层
      await evaluate(`document.querySelector('.fab')?.click()`);
      await sleep(350);
      break;
    case 'offline': // 离线结算摘要：种 child + 2h 缺口 → 停表 → 重载
      await evaluate(`(function(){
        const s = __pet.pet;
        s.stage='child'; s.characterId='child'; s.sick=false; s.poops=0;
        s.hungerHearts=2; s.happinessHearts=4;
        s.updatedAt = Date.now() - 2 * 3600 * 1000;
      })()`);
      await evaluate(`__pet.stop()`);
      await send('Page.navigate', { url: URL });
      await sleep(1800);
      break;
    case 'game': // 播种 child → 游戏屏（猜方向）
      await evaluate(seed('child'));
      await sleep(300);
      await evaluate(`__pet.icon = 2; __pet.press('B')`);
      await sleep(400);
      break;
    case 'dead': // 病逝 → 天使 + A+C 孵新蛋气泡
      await evaluate(`__pet.pet.stage='dead'; __pet.pet.characterId='angel'; __pet.pet.deadAt=Date.now(); __pet.pet.deathCause='sickness'; __pet.pet.sleeping=false`);
      await sleep(400);
      await shot(`${preset}-angel`);
      await evaluate(`__pet.press('A'); __pet.press('C')`);
      await sleep(500);
      await shot(`${preset}-rebirth`);
      continue;
    case 'shell': // 机身换色（M5）：蓝 → 黄
      await evaluate(`__pet.setShellColor('blue')`);
      await sleep(300);
      await shot('shell-blue');
      await evaluate(`__pet.setShellColor('yellow')`);
      await sleep(300);
      await shot('shell-yellow');
      continue;
    case 'sleep': // 拨钟到 22:00 → baby 入睡 + 关灯 → 全黑屏
      await evaluate(shiftClock(22));
      await evaluate(`${seed('baby')}; __pet.pet.lightsOff = true;`);
      await sleep(1500);
      break;
  }
  await shot(preset);
}

ws.close();
proc.kill();
console.log('done');
process.exit(0);
