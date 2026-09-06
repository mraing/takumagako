/**
 * 32×16 点阵屏渲染器：纯函数，输入宠物状态 + UI 快照，绘制一帧。
 * 画布物理尺寸即 32×16，由 CSS 整数倍放大（image-rendering: pixelated）。
 */
import type { PetState } from '@takumagako/core';
import { SCREEN_W, SCREEN_H, CHARACTERS, OVERLAYS, FONT, ICONS } from './sprites';

export const LCD_BG = '#c9d1a4'; // 复古绿灰底
export const LCD_FG = '#3b3f2c'; // 1-bit 墨色

export type UiScreen = 'main' | 'feed' | 'game' | 'meter';

export interface UiSnapshot {
  screen: UiScreen;
  feedSel: 0 | 1;
  meterPage: number;
  game: {
    phase: 'ask' | 'reveal' | 'done';
    round: number; // 已完成局数 0..5
    wins: number;
    petMove: 'L' | 'R' | null;
    win: boolean | null;
  };
  fx: { kind: 'meal' | 'snack' | 'flush' | 'inject' | 'scold' | 'win'; until: number } | null;
}

export interface SceneInput {
  pet: PetState;
  ui: UiSnapshot;
  now: number; // performance.now()
}

function mat(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  ox: number,
  oy: number,
  fg = LCD_FG,
): void {
  ctx.fillStyle = fg;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y] as string;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

function digits(ctx: CanvasRenderingContext2D, text: string, ox: number, oy: number): number {
  let x = ox;
  for (const ch of text) {
    const glyph = FONT[ch];
    if (glyph) mat(ctx, glyph, x, oy);
    x += 4;
  }
  return x - ox;
}

const HEART_FULL = OVERLAYS.heart;
const HEART_EMPTY = ['.#.#.', '#...#', '#...#', '.###.', '..#..'];

/** 主画面 */
function renderMain(ctx: CanvasRenderingContext2D, pet: PetState, ui: UiSnapshot, now: number): void {
  const body = CHARACTERS[pet.characterId] ?? CHARACTERS.egg!;
  const bounce = pet.sleeping ? 0 : Math.floor(now / 500) % 2;
  mat(ctx, body, 8 + bounce, 0);

  // 睡觉：右上 Zzz
  if (pet.sleeping) mat(ctx, OVERLAYS.zzz, 23, 4);
  // 生病：右上骷髅（闪烁）
  if (pet.sick && Math.floor(now / 250) % 2 === 0) mat(ctx, OVERLAYS.skull, 23, 1);
  // 便便（最多 3 堆，沿左下排开）
  for (let i = 0; i < pet.poops; i++) mat(ctx, OVERLAYS.poop, i * 8, 11);

  // 叫唤：头顶感叹号（250ms 闪烁）
  if (pet.attention !== 'none' && Math.floor(now / 250) % 2 === 0) {
    mat(ctx, OVERLAYS.bang, 24, 0);
  }

  // 动作特效
  if (ui.fx && now < ui.fx.until) {
    switch (ui.fx.kind) {
      case 'meal': mat(ctx, OVERLAYS.bowl, 12, 10); break;
      case 'snack': mat(ctx, OVERLAYS.candy, 14, 10); break;
      case 'flush': mat(ctx, OVERLAYS.splash, 12, 10); break;
      case 'inject': mat(ctx, OVERLAYS.syringe, 21, 6); break;
      case 'scold': mat(ctx, OVERLAYS.bang, 15, 0); break;
      case 'win': mat(ctx, HEART_FULL, 14, 0); break;
    }
  }
}

/** 喂食选择屏：左侧正餐 / 右侧零食，选中项闪烁边框 */
function renderFeed(ctx: CanvasRenderingContext2D, ui: UiSnapshot, now: number): void {
  mat(ctx, OVERLAYS.bowl, 5, 5);
  mat(ctx, OVERLAYS.candy, 20, 6);
  if (Math.floor(now / 250) % 2 === 0) {
    const [x0, x1, y0, y1] = ui.feedSel === 0 ? [3, 14, 3, 12] : [18, 25, 4, 13];
    for (let x = x0; x <= x1; x++) {
      ctx.fillStyle = LCD_FG;
      ctx.fillRect(x, y0, 1, 1);
      ctx.fillRect(x, y1, 1, 1);
    }
    for (let y = y0; y <= y1; y++) {
      ctx.fillStyle = LCD_FG;
      ctx.fillRect(x0, y, 1, 1);
      ctx.fillRect(x1, y, 1, 1);
    }
  }
}

/** 猜方向游戏（使用宠物自己的形态） */
function renderGame(
  ctx: CanvasRenderingContext2D,
  pet: PetState,
  ui: UiSnapshot,
  now: number,
): void {
  const g = ui.game;
  const body = CHARACTERS[pet.characterId] ?? CHARACTERS.child!;
  // 回合计数：5 个小格
  for (let i = 0; i < 5; i++) {
    const x = 11 + i * 2;
    ctx.fillStyle = LCD_FG;
    if (i < g.round) ctx.fillRect(x, 1, 2, 1);
    else ctx.fillRect(x, 1, 1, 1);
  }

  if (g.phase === 'ask') {
    mat(ctx, body, 8, 0); // 背对玩家蓄势
    if (Math.floor(now / 250) % 2 === 0) {
      mat(ctx, OVERLAYS.arrowL, 1, 5);
      mat(ctx, OVERLAYS.arrowR, 24, 5);
    }
  } else if (g.phase === 'reveal') {
    mat(ctx, body, 8, 0);
    if (g.petMove === 'L') mat(ctx, OVERLAYS.arrowL, 2, 2);
    else mat(ctx, OVERLAYS.arrowR, 23, 2);
    if (g.win) mat(ctx, HEART_FULL, 14, 0);
  } else {
    // done：胜局数以爱心呈现
    for (let i = 0; i < 5; i++) {
      const x = 3 + i * 6;
      if (i < g.wins) mat(ctx, HEART_FULL, x, 5);
      else mat(ctx, HEART_EMPTY, x, 5);
    }
  }
}

/** 状态分页：0 年龄+体重 / 1 管教度 / 2 饱食 / 3 快乐 */
function renderMeter(ctx: CanvasRenderingContext2D, pet: PetState, ui: UiSnapshot): void {
  switch (ui.meterPage) {
    case 0: {
      // 年龄（左）｜体重+g（右）
      digits(ctx, String(pet.ageYears), 4, 5);
      digits(ctx, String(pet.weightG), 18, 5);
      mat(ctx, FONT.g!, 18 + String(pet.weightG).length * 4, 5);
      break;
    }
    case 1: {
      // 管教度：10 格进度条
      const filled = Math.round(pet.disciplinePct / 10);
      for (let i = 0; i < 10; i++) {
        const x = 2 + i * 3;
        ctx.fillStyle = LCD_FG;
        ctx.fillRect(x, 6, i < filled ? 2 : 1, 3);
      }
      break;
    }
    case 2:
    case 3: {
      const n = ui.meterPage === 2 ? pet.hungerHearts : pet.happinessHearts;
      for (let i = 0; i < 4; i++) {
        const x = 2 + i * 8;
        if (i < n) mat(ctx, HEART_FULL, x, 5);
        else mat(ctx, HEART_EMPTY, x, 5);
      }
      break;
    }
  }
}

/** 绘制一帧 */
export function renderScene(ctx: CanvasRenderingContext2D, input: SceneInput): void {
  const { pet, ui, now } = input;

  // 关灯睡觉：整屏熄灭（忠实原版，开灯请按 💡+B）
  if (pet.sleeping && pet.lightsOff) {
    ctx.fillStyle = LCD_FG;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    return;
  }

  ctx.fillStyle = LCD_BG;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  switch (ui.screen) {
    case 'main': renderMain(ctx, pet, ui, now); break;
    case 'feed': renderFeed(ctx, ui, now); break;
    case 'game': renderGame(ctx, pet, ui, now); break;
    case 'meter': renderMeter(ctx, pet, ui); break;
  }
}

export { SCREEN_W, SCREEN_H, ICONS };
