<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import QRCode from 'qrcode';
import { useNetStore } from '../stores/net';
import { usePetStore } from '../stores/pet';

const net = useNetStore();
const petStore = usePetStore();

const joinInput = ref('');
const qrData = ref('');

// 存储实例上的 ref 已被 pinia 解包，直接读字符串
const joinUrl = computedUrl();

function computedUrl(): string {
  return `${location.origin}${location.pathname}?room=${net.roomCode ?? ''}`;
}

watch(
  () => net.roomCode,
  async (code) => {
    if (!code) {
      qrData.value = '';
      return;
    }
    qrData.value = await QRCode.toDataURL(`${location.origin}${location.pathname}?room=${code}`, {
      width: 132,
      margin: 1,
    });
  },
);

function join(): void {
  void net.joinRoom(joinInput.value.trim());
}

// ---- 存档工具（M5）----
const fileInput = ref<HTMLInputElement | null>(null);
const importMsg = ref('');

function downloadSave(): void {
  const blob = new Blob([petStore.exportSave()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `takumagako-gen${petStore.pet.generation}.json`;
  a.click();
  URL.revokeObjectURL(url);
  importMsg.value = '已导出到下载目录';
}

async function onFilePick(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text();
  const r = petStore.importSave(text);
  importMsg.value = r === 'ok' ? '导入成功，宠物已就位！' : '这不是有效的拓麻歌子存档';
  input.value = '';
}

const COLORS = [
  { key: 'pink', label: '粉', swatch: '#f2a7c6' },
  { key: 'blue', label: '蓝', swatch: '#a7c8f2' },
  { key: 'yellow', label: '黄', swatch: '#f2d189' },
] as const;

// ---- 震动 / 通知开关（设备本地偏好） ----
const NOTIFY_LABEL: Record<string, string> = {
  unsupported: '🔕 通知不支持',
  denied: '🔕 通知被拒',
  off: '🔕 通知关',
  on: '🔔 通知开',
};
const notifyLabel = computed(() => NOTIFY_LABEL[petStore.notifyUi] ?? '🔕 通知关');
const notifyHint = computed(() => {
  if (petStore.notifyUi === 'unsupported') return '通知：此浏览器不支持';
  if (petStore.notifyUi === 'denied') return '通知：权限被拒，请在浏览器设置里允许';
  if (petStore.notifyUi === 'on') return '通知：它叫你/生病/离开人世时会提醒（切到后台才发）';
  return '通知：打开后切到后台也能收到它的呼救';
});
</script>

<template>
  <div class="netpanel">
    <h2>联机</h2>

    <!-- 空闲：创建 / 加入 -->
    <template v-if="net.netState === 'idle'">
      <p class="tip">和另一台设备上的拓麻歌子交朋友（同一局域网）</p>
      <div class="actions">
        <button class="btn" @click="net.hostRoom()">创建房间</button>
      </div>
      <div class="join">
        <input
          v-model="joinInput"
          class="code"
          inputmode="numeric"
          maxlength="6"
          placeholder="房间号"
          @keyup.enter="join"
        />
        <button class="btn" :disabled="joinInput.trim().length < 6" @click="join">加入</button>
      </div>
      <p v-if="net.netError" class="err">{{ net.netError }}</p>
    </template>

    <!-- 等待配对 -->
    <template v-else-if="net.netState === 'signaling' || net.netState === 'connecting'">
      <p class="tip">房间号 <b class="big">{{ net.roomCode ?? '…' }}</b></p>
      <img v-if="qrData" class="qr" :src="qrData" alt="加入房间二维码" />
      <p class="small">{{ joinUrl }}</p>
      <button class="btn ghost" @click="net.disconnect()">取消</button>
    </template>

    <!-- 已连接：社交玩法 -->
    <template v-else-if="net.netState === 'connected' && net.friend">
      <div class="friend">
        <span class="dot"></span>
        <b>{{ net.friend.name }}</b>
        <span class="meta">第 {{ net.friend.generation }} 代 · {{ net.friend.stage }}</span>
      </div>
      <div class="actions">
        <button class="btn" @click="net.visit()">拜访</button>
        <button class="btn" @click="net.sendGift('meal')">送正餐</button>
        <button class="btn" @click="net.sendGift('snack')">送零食</button>
        <button class="btn" @click="net.sendGift('toy')">送玩具</button>
        <button class="btn" @click="net.inviteRps()">猜拳</button>
      </div>

      <!-- 猜拳交互 -->
      <div v-if="net.rps.phase === 'choosing'" class="rps">
        <p>出拳：</p>
        <div class="rps-row">
          <button class="btn" @click="net.chooseRps('rock')">石头</button>
          <button class="btn" @click="net.chooseRps('scissors')">剪刀</button>
          <button class="btn" @click="net.chooseRps('paper')">布</button>
        </div>
      </div>
      <div v-else-if="net.rps.phase === 'revealing'" class="rps">
        <p>揭晓中…</p>
      </div>
      <div v-else-if="net.rps.phase === 'result'" class="rps">
        <p>{{ net.rps.winner === 'me' ? '你赢了！' : net.rps.winner === 'you' ? '你输了…' : '平局！' }}</p>
        <button class="btn ghost" @click="net.inviteRps()">再来一局</button>
      </div>

      <button class="btn ghost leave" @click="net.disconnect()">断开</button>
    </template>

    <!-- 存档工具 + 外观 -->
    <div class="tools">
      <div class="row">
        <button class="btn ghost" @click="downloadSave">导出存档</button>
        <button class="btn ghost" @click="fileInput?.click()">导入存档</button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="file" @change="onFilePick" />
      </div>
      <p v-if="importMsg" class="small">{{ importMsg }}</p>
      <div class="row appearance">
        <button class="btn ghost" @click="petStore.toggleMuted()">
          {{ petStore.settings.muted ? '🔇 静音中' : '🔊 有声音' }}
        </button>
        <button class="btn ghost" @click="petStore.toggleHaptics()">
          {{ petStore.prefs.haptics ? '📳 有震动' : '🚫 无震动' }}
        </button>
        <button class="btn ghost" @click="petStore.toggleNotify()">
          {{ notifyLabel }}
        </button>
        <span
          v-for="c in COLORS"
          :key="c.key"
          class="swatch"
          role="button"
          tabindex="0"
          :aria-label="`换成${c.label}色机身`"
          :class="{ on: petStore.settings.shellColor === c.key }"
          :style="{ background: c.swatch }"
          @click="petStore.setShellColor(c.key)"
          @keyup.enter="petStore.setShellColor(c.key)"
        ></span>
      </div>
      <p class="small hint">
        {{ notifyHint }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.netpanel {
  font-size: 13px;
  line-height: 1.6;
}
.tip {
  margin: 0 0 8px;
  color: #8a7f6e;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.join {
  margin-top: 8px;
  display: flex;
  gap: 6px;
}
.code {
  width: 8.5em;
  padding: 7px 10px;
  border: 2px solid #cbbfa8;
  border-radius: 8px;
  background: #fffdf6;
  font-size: 14px;
  letter-spacing: 0.3em;
  text-align: center;
}
.btn {
  padding: 7px 12px;
  border: 2px solid #3b3f2c;
  border-radius: 10px;
  background: #f2a7c6;
  color: #5c2440;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn.ghost {
  background: #f6efe0;
  color: #6d6355;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4caf7d;
  margin-right: 4px;
}
.meta {
  color: #8a7f6e;
  font-size: 11px;
}
.qr {
  display: block;
  margin: 4px auto 8px;
  border: 2px solid #3b3f2c;
  border-radius: 8px;
}
.small {
  font-size: 11px;
  color: #a89c8a;
  word-break: break-all;
}
.err {
  color: #c14a4a;
  margin: 6px 0 0;
}
.rps {
  margin-top: 8px;
}
.rps-row {
  display: flex;
  gap: 8px;
}
.leave {
  margin-top: 10px;
}
/* 存档工具与外观（M5） */
.tools {
  margin-top: 14px;
  border-top: 1.5px dashed #cbbfa8;
  padding-top: 10px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.file {
  display: none;
}
.appearance {
  margin-bottom: 2px;
  flex-wrap: wrap;
}
.hint {
  margin: 2px 0 0;
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(59, 63, 44, 0.35);
  cursor: pointer;
}
.swatch.on {
  outline: 3px solid #3b3f2c;
  outline-offset: 1px;
}
</style>
