/**
 * 触感震动（Web Vibration API）：与 sfx 同词汇表的具名震动模式。
 * 注意：Android Chrome/Edge 支持；iOS Safari 无 navigator.vibrate（静默降级，无副作用）。
 * prefs.haptics 关闭时静默；任何异常都吞掉，震动永不阻塞输入。
 */

export type HapticName = 'key' | 'tap' | 'confirm' | 'attention' | 'win' | 'hatch' | 'error';

/** 具名震动模式（ms 数组 = 震/停交替） */
const PATTERNS: Record<HapticName, number | number[]> = {
  key: 8, // 三键 / 确认
  tap: 6, // 图标光标移动
  confirm: 14, // 照料动作成功（喂食/打针/冲洗/管教）
  attention: [40, 90, 40], // 叫唤：短-顿-短
  win: [18, 60, 18, 60, 36], // 游戏胜利三连
  hatch: [14, 70, 14, 70, 30], // 孵化/进化
  error: 120, // 生病/离世长震
};

export function haptic(name: HapticName, enabled: boolean): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(PATTERNS[name]);
  } catch {
    /* 震动不可用时静默 */
  }
}
