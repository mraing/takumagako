/**
 * 联机社交 store：Transport 生命周期 + 应用协议（§8.3）。
 * 协议只传"事件"，双方在各自本地引擎独立结算：
 * - 互相拜访：双方快乐 +1 心（每日 1 次，防刷）
 * - 礼物：正餐/零食/玩具即时生效并回 gift_ack
 * - 猜拳：commit-reveal 防作弊，胜 +2 心 / 败 +1 心 / 平 +1 心
 * 社交状态（lastVisitAt）暂存 tk-net-v1，M5 并入 SaveFile stats。
 */
import { defineStore } from 'pinia';
import { reactive, ref } from 'vue';
import {
  decodeMsg,
  encodeMsg,
  type GiftPayload,
  type NetMsg,
  type PetProfile,
} from '@takumagako/protocol';
import { RtcTransport, type NetEvent, type NetState } from '../net/rtc';
import { usePetStore } from './pet';

const NET_KEY = 'takumagako-net-v1'; // { lastVisitAt }
const VISIT_COOLDOWN_MS = 20 * 3600_000; // 每日每好友 1 次（宽松按 20h）

type RpsMove = 'rock' | 'scissors' | 'paper';

/** 同步确定性哈希（commit-reveal 用）：不依赖 crypto.subtle（局域网 HTTP 无此 API） */
function hashHex(input: string): string {
  // FNV-1a 四轮异构 → 32 位十六进制
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x93d1c981;
  let h4 = 0xc9dc5118;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 + c, 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 - c, 0x27d4eb2f) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, '0') +
    h2.toString(16).padStart(8, '0') +
    h3.toString(16).padStart(8, '0') +
    h4.toString(16).padStart(8, '0')
  );
}

function rpsBeats(a: RpsMove, b: RpsMove): boolean {
  return (
    (a === 'rock' && b === 'scissors') ||
    (a === 'scissors' && b === 'paper') ||
    (a === 'paper' && b === 'rock')
  );
}

export const useNetStore = defineStore('net', () => {
  const petStore = usePetStore();
  const pet = petStore.pet;

  // ---- UI 状态 ----
  const netState = ref<NetState>('idle');
  const roomCode = ref<string | null>(null);
  const role = ref<'host' | 'guest' | null>(null);
  const friend = ref<PetProfile | null>(null);
  const netError = ref<string | null>(null);
  const rps = reactive({
    phase: 'idle' as 'idle' | 'choosing' | 'revealing' | 'result',
    myMove: null as RpsMove | null,
    myHash: '',
    myNonce: '',
    theirHash: '',
    theirMove: null as RpsMove | null,
    winner: null as 'me' | 'you' | 'draw' | null,
  });
  let round = 0;

  function persistNet(): void {
    localStorage.setItem(NET_KEY, JSON.stringify({ lastVisitAt: lastVisitAt.value }));
  }
  const lastVisitAt = ref(loadVisit());

  function loadVisit(): number {
    try {
      return (JSON.parse(localStorage.getItem(NET_KEY) ?? '{}') as { lastVisitAt?: number }).lastVisitAt ?? 0;
    } catch {
      return 0;
    }
  }

  // 名片（每次连接实时取）
  function profile(): PetProfile {
    return {
      id: pet.id,
      name: pet.name,
      characterId: pet.characterId,
      stage: pet.stage,
      generation: pet.generation,
      ageYears: pet.ageYears,
    };
  }

  function send(m: NetMsg): void {
    transport?.send(encodeMsg(m));
  }

  // ---- Transport ----
  let transport: RtcTransport | null = null;

  function onNet(e: NetEvent): void {
    switch (e.kind) {
      case 'state':
        netState.value = e.state;
        if (e.state === 'connected') {
          send({ t: 'hello', pet: profile() });
        }
        break;
      case 'room':
        roomCode.value = e.code;
        break;
      case 'message':
        try {
          onNetMsg(decodeMsg(e.raw));
        } catch {
          petStore.log.unshift('收到非法联机消息，已忽略');
        }
        break;
      case 'error':
        netError.value = e.reason;
        petStore.log.unshift(`联机：${e.reason}`);
        break;
    }
  }

  function resetRps(): void {
    Object.assign(rps, {
      phase: 'idle',
      myMove: null,
      myHash: '',
      myNonce: '',
      theirHash: '',
      theirMove: null,
      winner: null,
    });
  }

  function onNetMsg(m: NetMsg): void {
    switch (m.t) {
      case 'hello':
        friend.value = m.pet;
        send({ t: 'hello_ack', pet: profile() });
        petStore.log.unshift(`朋友 ${m.pet.name} 上线了！`);
        break;
      case 'hello_ack':
        friend.value = m.pet;
        break;
      case 'visit_start': {
        // 对方来拜访：我方 +1（每日 1 次），并回执"已生效"
        if (Date.now() - lastVisitAt.value >= VISIT_COOLDOWN_MS) {
          lastVisitAt.value = Date.now();
          persistNet();
          pet.happinessHearts = Math.min(4, pet.happinessHearts + 1);
          petStore.log.unshift(`朋友 ${friend.value?.name ?? '?'} 来拜访！快乐 +1`);
          send({ t: 'visit_state', mood: 'visited', action: 'play' });
        } else {
          send({ t: 'visit_state', mood: 'cooldown', action: 'none' });
        }
        break;
      }
      case 'visit_state':
        // 我方发起的拜访收到对方回执 → 我方 +1
        if (m.mood === 'visited' && Date.now() - lastVisitAt.value >= VISIT_COOLDOWN_MS) {
          lastVisitAt.value = Date.now();
          persistNet();
          pet.happinessHearts = Math.min(4, pet.happinessHearts + 1);
          petStore.log.unshift('拜访了朋友，双方快乐 +1！');
        } else if (m.mood === 'cooldown') {
          petStore.log.unshift('朋友今天已经被拜访过啦');
        }
        break;
      case 'gift':
        applyGift(m.gift);
        send({ t: 'gift_ack', accepted: true });
        break;
      case 'gift_ack':
        break;
      case 'game_invite':
        round += 1;
        resetRpsRound();
        rps.phase = 'choosing';
        petStore.log.unshift(`${friend.value?.name ?? '对方'} 发起猜拳！`);
        break;
      case 'game_commit':
        rps.theirHash = m.hash;
        tryReveal();
        break;
      case 'game_reveal': {
        // commit-reveal 校验：明文必须能还原出对方的承诺
        if (hashHex(`${m.move}:${m.nonce}`) !== rps.theirHash) {
          petStore.log.unshift('对方出拳校验失败，本轮作废');
          resetRpsRound();
          rps.phase = 'choosing';
          break;
        }
        rps.theirMove = m.move;
        settleRps();
        break;
      }
      case 'game_result':
        break;
      case 'bye':
        petStore.log.unshift('对方已离开');
        reset();
        break;
      default:
        break;
    }
  }

  function applyGift(g: GiftPayload): void {
    const from = friend.value?.name ?? '朋友';
    if (g.kind === 'meal') {
      pet.hungerHearts = Math.min(4, pet.hungerHearts + 1);
      petStore.log.unshift(`${from} 送来正餐！饱食 +1`);
    } else if (g.kind === 'snack') {
      pet.happinessHearts = Math.min(4, pet.happinessHearts + 1);
      petStore.log.unshift(`${from} 送来零食！快乐 +1`);
    } else {
      pet.happinessHearts = Math.min(4, pet.happinessHearts + 1);
      petStore.log.unshift(`${from} 送来玩具！快乐 +1`);
    }
  }

  function resetRpsRound(): void {
    Object.assign(rps, { myMove: null, myHash: '', theirHash: '', theirMove: null, winner: null });
  }

  function randomNonce(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function chooseRps(move: RpsMove): void {
    if (rps.phase !== 'choosing') return;
    const nonce = randomNonce();
    rps.myMove = move;
    rps.myNonce = nonce;
    rps.myHash = hashHex(`${move}:${nonce}`);
    send({ t: 'game_commit', round, hash: rps.myHash });
    tryReveal();
  }

  function tryReveal(): void {
    if (!rps.myMove || !rps.theirHash || !rps.myNonce) return;
    rps.phase = 'revealing';
    send({ t: 'game_reveal', round, move: rps.myMove, nonce: rps.myNonce });
  }

  function settleRps(): void {
    if (!rps.myMove || !rps.theirMove) return;
    const meWin = rpsBeats(rps.myMove, rps.theirMove);
    const draw = rps.myMove === rps.theirMove;
    rps.winner = draw ? 'draw' : meWin ? 'me' : 'you';
    const theirName = friend.value?.name ?? '对方';
    if (rps.winner === 'me') {
      pet.happinessHearts = Math.min(4, pet.happinessHearts + 2);
      petStore.log.unshift(`猜拳赢了 ${theirName}！快乐 +2`);
    } else if (rps.winner === 'you') {
      pet.happinessHearts = Math.min(4, pet.happinessHearts + 1);
      petStore.log.unshift(`猜拳输给了 ${theirName}，快乐 +1`);
    } else {
      pet.happinessHearts = Math.min(4, pet.happinessHearts + 1);
      petStore.log.unshift('猜拳平局，双方快乐 +1');
    }
    rps.phase = 'result';
    send({ t: 'game_result', round, winner: rps.winner === 'me' ? 'me' : rps.winner === 'you' ? 'you' : 'draw' });
  }

  // ---- 对外动作 ----
  async function hostRoom(): Promise<void> {
    role.value = 'host';
    netError.value = null;
    roomCode.value = null;
    transport?.close();
    transport = new RtcTransport(onNet);
    try {
      await transport.host();
    } catch {
      /* onNet 已发 error */
    }
  }

  async function joinRoom(code: string): Promise<void> {
    role.value = 'guest';
    netError.value = null;
    transport?.close();
    transport = new RtcTransport(onNet);
    try {
      await transport.join(code);
    } catch {
      /* onNet 已发 error */
    }
  }

  function visit(): void {
    if (Date.now() - lastVisitAt.value < VISIT_COOLDOWN_MS) {
      petStore.log.unshift('今天已经拜访过啦，明天再来');
      return;
    }
    send({ t: 'visit_start' });
    petStore.log.unshift(`去 ${friend.value?.name ?? '朋友'} 家拜访啦！`);
  }

  function sendGift(kind: GiftPayload['kind']): void {
    send({ t: 'gift', gift: { kind, id: Math.random().toString(36).slice(2) } });
    petStore.log.unshift(`把礼物送给了 ${friend.value?.name ?? '朋友'} 🎁`);
  }

  function inviteRps(): void {
    round += 1;
    resetRpsRound();
    rps.phase = 'choosing';
    send({ t: 'game_invite', game: 'rps' });
  }

  function disconnect(): void {
    send({ t: 'bye', reason: '下次再玩' });
    reset();
  }

  function reset(): void {
    transport?.close();
    transport = null;
    netState.value = 'idle';
    roomCode.value = null;
    friend.value = null;
    role.value = null;
    resetRps();
    round = 0;
  }

  return {
    netState,
    roomCode,
    role,
    friend,
    netError,
    rps,
    lastVisitAt,
    hostRoom,
    joinRoom,
    visit,
    sendGift,
    inviteRps,
    chooseRps,
    disconnect,
  };
});
