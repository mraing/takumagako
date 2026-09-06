/**
 * 联机应用层协议（DataChannel 消息）：前后端共享，zod 双向校验。
 * 详见《开发文档.md》§8.3。协议只传"事件"，双方在各自本地引擎独立结算。
 */
import { z } from 'zod';

export const petProfileSchema = z.object({
  id: z.string(),
  name: z.string().max(12),
  characterId: z.string(),
  stage: z.enum(['egg', 'baby', 'child', 'teen', 'adult', 'dead']),
  generation: z.number().int().min(1),
  ageYears: z.number().int().min(0),
});
export type PetProfile = z.infer<typeof petProfileSchema>;

const giftSchema = z.object({
  kind: z.enum(['meal', 'snack', 'toy']),
  id: z.string(),
  note: z.string().max(50).optional(),
});
export type GiftPayload = z.infer<typeof giftSchema>;

export const netMsgSchema = z.discriminatedUnion('t', [
  // 握手：交换宠物名片
  z.object({ t: z.literal('hello'), pet: petProfileSchema }),
  z.object({ t: z.literal('hello_ack'), pet: petProfileSchema }),

  // 拜访
  z.object({ t: z.literal('visit_start') }),
  z.object({ t: z.literal('visit_state'), mood: z.string(), action: z.string() }),
  z.object({ t: z.literal('visit_end') }),

  // 礼物
  z.object({ t: z.literal('gift'), gift: giftSchema }),
  z.object({ t: z.literal('gift_ack'), accepted: z.boolean() }),

  // 双人小游戏（猜拳用 commit-reveal：先发 hash，再发明文+nonce）
  z.object({ t: z.literal('game_invite'), game: z.enum(['rps', 'race']) }),
  z.object({ t: z.literal('game_commit'), round: z.number().int().min(0), hash: z.string() }),
  z.object({ t: z.literal('game_reveal'), round: z.number().int().min(0), move: z.enum(['rock', 'scissors', 'paper']), nonce: z.string() }),
  z.object({ t: z.literal('game_move'), round: z.number().int().min(0), move: z.string() }),
  z.object({ t: z.literal('game_result'), round: z.number().int().min(0), winner: z.enum(['me', 'you', 'draw']) }),

  // 通用
  z.object({ t: z.literal('ping') }),
  z.object({ t: z.literal('pong') }),
  z.object({ t: z.literal('bye'), reason: z.string().max(50).optional() }),
]);
export type NetMsg = z.infer<typeof netMsgSchema>;

export function encodeMsg(m: NetMsg): string {
  return JSON.stringify(m);
}

/** 解析失败抛 ZodError，调用方必须捕获并视为协议违规 */
export function decodeMsg(raw: string): NetMsg {
  return netMsgSchema.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// 信令层协议（WebSocket，服务器转发，不读业务内容）
// ---------------------------------------------------------------------------

export const signalMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('create_room') }),
  z.object({ t: z.literal('room_created'), room: z.string() }),
  z.object({ t: z.literal('join'), room: z.string() }),
  z.object({ t: z.literal('joined'), room: z.string() }),
  z.object({ t: z.literal('peer_joined') }),
  z.object({ t: z.literal('peer_left') }),
  z.object({ t: z.literal('room_full') }),
  z.object({ t: z.literal('room_gone') }),
  z.object({ t: z.literal('offer'), sdp: z.string().max(16_000) }),
  z.object({ t: z.literal('answer'), sdp: z.string().max(16_000) }),
  z.object({ t: z.literal('ice'), candidate: z.string().max(2_000) }),
  z.object({ t: z.literal('error'), reason: z.string().max(80) }),
  z.object({ t: z.literal('ping') }),
  z.object({ t: z.literal('pong') }),
]);
export type SignalMsg = z.infer<typeof signalMsgSchema>;

export function encodeSignal(m: SignalMsg): string {
  return JSON.stringify(m);
}

/** 解析失败抛 ZodError */
export function decodeSignal(raw: string): SignalMsg {
  return signalMsgSchema.parse(JSON.parse(raw));
}
