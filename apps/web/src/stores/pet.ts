/**
 * 宠物 store：core 引擎 ↔ Vue 响应式桥 + 仿原版三键 UI 状态机。
 * 引擎 tick 每 250ms 推进一次（advance 内部按 1s 步长批量结算）。
 */
import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
import {
  advance,
  applyGuessResult,
  createPet,
  decodeSave,
  encodeSave,
  feedMeal,
  feedSnack,
  flushPoop,
  giveMedicine,
  mulberry32,
  rebirth,
  scold,
  toggleLight,
  type PetEvent,
  type PetState,
  type Rng,
} from '@takumagako/core';
import type { UiScreen, UiSnapshot } from '../renderer/screen';
import { playSfx, sfxForEvent } from '../lib/sfx';

const SAVE_KEY = 'takumagako-save-v1';
const CORRUPT_KEY = 'takumagako-save-corrupt'; // 坏档备份槽（保留最近一份）
const ICON_COUNT = 7; // attention 为指示灯，不在光标环内
const OFFLINE_SUMMARY_MIN_MS = 60_000; // 离开 ≥1 分钟才弹摘要

/** 兼容非安全上下文：crypto.randomUUID 仅 HTTPS/localhost 可用，局域网 HTTP 下会崩 */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface GameUi {
  phase: 'ask' | 'reveal' | 'done';
  round: number;
  wins: number;
  petMove: 'L' | 'R' | null;
  win: boolean | null;
  revealUntil: number;
  doneUntil: number;
}

export interface ShellSettings {
  muted: boolean;
  shellColor: 'pink' | 'blue' | 'yellow';
}

function loadSave(): { pet: PetState | null; settings: Partial<ShellSettings>; corrupt: boolean } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { pet: null, settings: {}, corrupt: false };
    const r = decodeSave(raw);
    if (r.ok) {
      const sc = r.save.settings.shellColor;
      return {
        pet: r.save.pet,
        settings: { muted: r.save.settings.muted === true, shellColor: sc === 'blue' || sc === 'yellow' ? sc : 'pink' },
        corrupt: false,
      };
    }
    // 坏档：备份到固定槽位（绝不静默清档），重新孵化
    localStorage.setItem(CORRUPT_KEY, raw);
    return { pet: null, settings: {}, corrupt: true };
  } catch {
    return { pet: null, settings: {}, corrupt: false };
  }
}

export const usePetStore = defineStore('pet', () => {
  const rng: Rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  const loaded = loadSave();
  const pet = reactive<PetState>(
    loaded.pet ?? createPet({ id: uuid(), name: '小蛋', now: Date.now(), rng }),
  );

  // ---- UI 状态 ----
  const screen = ref<UiScreen>('main');
  const icon = ref(0); // 0喂食 1灯 2游戏 3医疗 4冲洗 5状态 6管教
  const feedSel = ref<0 | 1>(0);
  const meterPage = ref(0);
  const fx = ref<UiSnapshot['fx']>(null);
  const game = reactive<GameUi>({
    phase: 'ask',
    round: 0,
    wins: 0,
    petMove: null,
    win: null,
    revealUntil: 0,
    doneUntil: 0,
  });
  const notice = ref<{ text: string; until: number } | null>(null);
  const log = ref<string[]>([]);
  const offlineSummary = ref<string[] | null>(null); // "你不在的时候…"弹窗内容
  const settings = reactive<ShellSettings>({
    muted: loaded.settings.muted === true,
    shellColor: loaded.settings.shellColor === 'blue' || loaded.settings.shellColor === 'yellow' ? loaded.settings.shellColor : 'pink',
  });
  let feedPending = false; // 喂食后等特效播完再自动回主页
  let lastNotice: { text: string; at: number } = { text: '', at: 0 };
  let lastKey: { key: string; at: number } = { key: '', at: 0 };
  let lastSaveAt = 0; // 防抖 2s 节流落盘

  function save(): void {
    lastSaveAt = Date.now();
    localStorage.setItem(
      SAVE_KEY,
      encodeSave(pet, { muted: settings.muted, shellColor: settings.shellColor }, { friendsMet: 0 }, lastSaveAt),
    );
  }

  function showNotice(text: string): void {
    const now = Date.now();
    if (lastNotice.text === text && now - lastNotice.at < 30_000) return; // 气泡冷却 30s
    lastNotice = { text, at: now };
    notice.value = { text, until: now + 4000 };
  }

  function describe(e: PetEvent): string {
    switch (e.type) {
      case 'hatched': return '孵化啦！';
      case 'evolved': return `进化成 ${e.to}！`;
      case 'pooped': return '拉便便了';
      case 'sick': return '生病了！快打针';
      case 'recovered': return '康复了';
      case 'fell-asleep': return '睡着了，记得关灯';
      case 'woke-up': return '睡醒了';
      case 'call': return e.kind === 'need' ? '在叫唤：有需求！' : '无理取闹！按管教';
      case 'call-cleared': return '安静下来了';
      case 'care-mistake': return `照料失误（${e.reason}）×${e.total}`;
      case 'aged': return `${e.years} 岁了`;
      case 'died': return '去了天堂…按 A+C 孵新蛋';
    }
  }

  /** 250ms 主循环：引擎推进 + UI 计时 + 防抖落盘 */
  function tick(): void {
    const now = Date.now();
    const events = advance(pet, now, rng);
    for (const e of events) {
      log.value.unshift(describe(e));
      if (['hatched', 'evolved', 'sick', 'died', 'call', 'aged', 'woke-up'].includes(e.type)) {
        showNotice(describe(e));
      }
      const s = sfxForEvent(e);
      if (s) playSfx(s, settings.muted);
    }
    if (log.value.length > 8) log.value.length = 8;

    // 首个 tick 携带整段离线结算 → 生成摘要弹窗
    if (pendingSummaryMs > 0) {
      if (pendingSummaryMs >= OFFLINE_SUMMARY_MIN_MS) {
        offlineSummary.value = buildSummary(events, pendingSummaryMs);
      }
      pendingSummaryMs = 0;
    }

    if (fx.value && now >= fx.value.until) fx.value = null;
    if (screen.value === 'feed' && feedPending && !fx.value) {
      screen.value = 'main'; // 吃完自动回主页
      feedPending = false;
    }

    if (screen.value === 'game') {
      if (game.phase === 'reveal' && now >= game.revealUntil) {
        if (game.round >= 5) {
          game.phase = 'done';
          game.doneUntil = now + 2400;
        } else {
          game.phase = 'ask';
          game.petMove = null;
          game.win = null;
        }
      } else if (game.phase === 'done' && now >= game.doneUntil) {
        applyGuessResult(pet, game.wins);
        fx.value = { kind: 'win', until: now + 1500 };
        playSfx('win', settings.muted);
        screen.value = 'main';
      }
    }

    if (pet.sleeping && screen.value !== 'main') {
      screen.value = 'main';
      fx.value = null;
    }
    if (notice.value && now >= notice.value.until) notice.value = null;

    if (now - lastSaveAt >= 2000) save(); // 防抖 ≈2s 落盘一次
  }

  // ---- 图标确认（B 键）----
  function activateIcon(): void {
    const now = Date.now();
    switch (icon.value) {
      case 0: // 喂食
        if (pet.sleeping) return showNotice('它睡着了 Zzz');
        if (pet.stage === 'egg') return showNotice('蛋还没有孵化');
        feedPending = false;
        screen.value = 'feed';
        return;
      case 1: {
        // 灯
        const r = toggleLight(pet);
        if (!r.ok) showNotice(r.reason);
        return;
      }
      case 2: {
        // 游戏
        if (pet.stage === 'egg') return showNotice('蛋还没有孵化');
        if (pet.sleeping) return showNotice('它睡着了 Zzz');
        if (pet.stage === 'baby') return showNotice('它还太小，不会玩游戏');
        if (pet.sick) return showNotice('生病了，没力气玩');
        Object.assign(game, {
          phase: 'ask',
          round: 0,
          wins: 0,
          petMove: null,
          win: null,
          revealUntil: 0,
          doneUntil: 0,
        });
        screen.value = 'game';
        return;
      }
      case 3: {
        // 医疗
        const r = giveMedicine(pet, rng);
        if (!r.ok) return showNotice(r.reason);
        fx.value = { kind: 'inject', until: now + 2000 };
        return;
      }
      case 4: {
        // 冲洗
        const r = flushPoop(pet);
        if (!r.ok) return showNotice(r.reason);
        fx.value = { kind: 'flush', until: now + 1500 };
        return;
      }
      case 5: {
        // 状态
        meterPage.value = 0;
        screen.value = 'meter';
        return;
      }
      case 6: {
        // 管教
        const r = scold(pet);
        if (!r.ok) return showNotice(r.reason);
        fx.value = { kind: 'scold', until: now + 1500 };
        return;
      }
    }
  }

  function guess(move: 'L' | 'R'): void {
    const petMove: 'L' | 'R' = rng() < 0.5 ? 'L' : 'R';
    const win = move === petMove;
    game.petMove = petMove;
    game.win = win;
    game.round += 1;
    if (win) game.wins += 1;
    game.phase = 'reveal';
    game.revealUntil = Date.now() + 900;
  }

  /** 三键入口（原版 A/B/C 语义；死亡时 A+C 组合孵新蛋） */
  function press(key: 'A' | 'B' | 'C'): void {
    const now = Date.now();
    playSfx('key', settings.muted);
    if (pet.stage === 'dead') {
      // 800ms 宽限：鼠标先后点击 A、C 也能命中组合
      if (
        (key === 'A' && lastKey.key === 'C' && now - lastKey.at < 800) ||
        (key === 'C' && lastKey.key === 'A' && now - lastKey.at < 800)
      ) {
        rebirth(pet, now, rng);
        log.value.unshift(`第 ${pet.generation} 代开始`);
        showNotice(`第 ${pet.generation} 代的新蛋诞生了！`);
      } else {
        // 单击无反应时给出明确指引（避免"按钮失灵"的错觉）
        showNotice('同时按下 A 和 C，孵新蛋');
      }
      lastKey = { key, at: now };
      return;
    }
    lastKey = { key, at: now };

    // 睡眠中：A 仍可移动光标（原版行为）；只有「灯」可执行，其余给出指引
    if (pet.sleeping) {
      if (key === 'A') {
        icon.value = (icon.value + 1) % ICON_COUNT;
        return;
      }
      if (key === 'B' && screen.value === 'main' && icon.value === 1) {
        activateIcon(); // 灯：开灯 / 关灯
        return;
      }
      showNotice('它睡着了 · 选「灯」按 B 开灯');
      return;
    }

    switch (screen.value) {
      case 'main': {
        if (key === 'A') {
          icon.value = (icon.value + 1) % ICON_COUNT;
        } else if (key === 'B') {
          activateIcon();
        }
        return;
      }
      case 'feed': {
        if (key === 'A') {
          feedSel.value = feedSel.value === 0 ? 1 : 0;
        } else if (key === 'B') {
          const r = feedSel.value === 0 ? feedMeal(pet) : feedSnack(pet, now);
          if (!r.ok) {
            showNotice(r.reason);
            return;
          }
          feedPending = true;
          fx.value = { kind: feedSel.value === 0 ? 'meal' : 'snack', until: now + 2500 };
        } else {
          screen.value = 'main';
        }
        return;
      }
      case 'meter': {
        if (key === 'A' || key === 'B') {
          meterPage.value = (meterPage.value + 1) % 4;
        } else {
          screen.value = 'main';
        }
        return;
      }
      case 'game': {
        if (game.phase !== 'ask') return;
        if (key === 'A') guess('L');
        else if (key === 'B') guess('R');
        else screen.value = 'main';
        return;
      }
    }
  }

  /** 渲染器快照 */
  function snapshot(): { pet: PetState; ui: UiSnapshot } {
    return {
      pet,
      ui: {
        screen: screen.value,
        feedSel: feedSel.value,
        meterPage: meterPage.value,
        game: { phase: game.phase, round: game.round, wins: game.wins, petMove: game.petMove, win: game.win },
        fx: fx.value,
      },
    };
  }

  /** 离线结算摘要："你不在的时候发生了…"（离开 ≥1 分钟且有值得一提的事） */
  function buildSummary(events: PetEvent[], offlineMs: number): string[] {
    const h = Math.floor(offlineMs / 3_600_000);
    const m = Math.floor((offlineMs % 3_600_000) / 60_000);
    const dur = h > 0 ? `${h} 小时${m > 0 ? ` ${m} 分钟` : ''}` : `${Math.max(1, m)} 分钟`;
    const lines: string[] = [`你离开了 ${dur}`];

    const count = new Map<string, number>();
    let lastMistakeTotal = 0;
    for (const e of events) {
      count.set(e.type, (count.get(e.type) ?? 0) + 1);
      if (e.type === 'care-mistake') lastMistakeTotal = e.total;
    }
    const n = (t: string) => count.get(t) ?? 0;
    if (n('hatched')) lines.push('它孵化了！');
    if (n('evolved')) lines.push('它进化成了新的形态！');
    if (n('aged')) lines.push(n('aged') > 1 ? `它长大了 ${n('aged')} 岁` : '它长大了一岁');
    if (n('pooped')) lines.push(`它拉了 ${n('pooped')} 次便便`);
    if (n('fell-asleep')) lines.push(`它睡了 ${n('fell-asleep')} 觉`);
    if (n('call')) lines.push(`它叫了你 ${n('call')} 次`);
    if (n('care-mistake')) lines.push(`累积了 ${lastMistakeTotal} 次照料失误…`);
    if (n('sick')) lines.push(pet.sick ? '它生病了，快打针！' : '它生过病，后来康复了');
    if (n('recovered')) lines.push('它康复了');
    if (n('died')) lines.push('它去了天堂…按 A+C 孵新蛋');
    if (lines.length === 1) lines.push('它安静地等你回来');
    return lines;
  }

  let timer: number | null = null;
  let pendingSummaryMs = 0; // >0 时首个 tick 的结算事件构成离线摘要
  function start(): void {
    if (timer !== null) return;
    pendingSummaryMs = Math.max(0, Date.now() - pet.updatedAt); // 启动即离线结算
    tick();
    if (loaded.corrupt) log.value.unshift('存档损坏，已备份后重新孵化');
    timer = window.setInterval(tick, 250);
    window.addEventListener('beforeunload', save);
  }
  function stop(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    window.removeEventListener('beforeunload', save);
    save();
  }

  return {
    pet,
    screen,
    icon,
    feedSel,
    meterPage,
    fx,
    game,
    notice,
    log,
    offlineSummary,
    settings,
    toggleMuted: () => {
      settings.muted = !settings.muted;
      save();
    },
    setShellColor: (c: ShellSettings['shellColor']) => {
      settings.shellColor = c;
      save();
    },
    /** 导出当前存档 JSON（M5 存档工具） */
    exportSave: (): string =>
      encodeSave(pet, { muted: settings.muted, shellColor: settings.shellColor }, { friendsMet: 0 }, Date.now()),
    /** 导入存档：合法则整体替换（UI 复位），非法返回 bad */
    importSave: (raw: string): 'ok' | 'bad' => {
      const r = decodeSave(raw);
      if (!r.ok) return 'bad';
      Object.assign(pet, r.save.pet);
      screen.value = 'main';
      fx.value = null;
      offlineSummary.value = null;
      meterPage.value = 0;
      save();
      log.value.unshift('存档导入成功！');
      return 'ok';
    },
    clearOfflineSummary: () => {
      offlineSummary.value = null;
    },
    saveNow: save,
    press,
    snapshot,
    start,
    stop,
  };
});
