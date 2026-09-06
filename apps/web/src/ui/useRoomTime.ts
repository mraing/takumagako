import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export type RoomPeriod = 'night' | 'dawn' | 'day' | 'dusk';

/** 读取本地小时（含分钟小数）；支持 window.__tk_room_hour 覆盖，供视觉走查用 */
function hourNow(): number {
  const w = window as unknown as Record<string, unknown>;
  if (typeof w.__tk_room_hour === 'number') return w.__tk_room_hour as number;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

/** 时段划分：黎明 5–8 / 白天 8–17 / 黄昏 17–20 / 夜晚 20–5 */
export function periodForHour(h: number): RoomPeriod {
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

/**
 * 「活的房间」时间源：跟随真实本地时间流转（呼应 ADR-01 真实时间驱动）。
 * dark 参数：宠物睡着且关灯 → 房间跟着熄灯（压暗当前时段而非强切夜空）。
 */
export function useRoomTime(lightsOut: Ref<boolean>): { period: Ref<RoomPeriod>; roomDark: Ref<boolean> } {
  const hour = ref(hourNow());
  let timer = 0;
  onMounted(() => {
    timer = window.setInterval(() => {
      hour.value = hourNow();
    }, 30_000);
  });
  onBeforeUnmount(() => window.clearInterval(timer));

  const period = computed<RoomPeriod>(() => periodForHour(hour.value));
  const roomDark = computed(() => lightsOut.value || period.value === 'night');
  return { period, roomDark };
}
