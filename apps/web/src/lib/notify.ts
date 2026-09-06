/**
 * 消息通知（Web Notifications API）：宠物需要照料而你不在页面上时提醒。
 * 设计约束：
 * - 只在标签页不可见（document.hidden）时发送——正盯着机器看时绝不打扰；
 * - tag 去重：同一类提醒（如"叫唤"）后到覆盖先到，不刷屏；
 * - 回到前台自动清掉未读通知；
 * - 优先走 ServiceWorker showNotification（PWA 后台更可靠），不可用退回页面内 Notification。
 */

export type NotifyState = 'unsupported' | 'denied' | 'default' | 'granted';

export function notifySupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function notifyState(): NotifyState {
  if (!notifySupported()) return 'unsupported';
  return Notification.permission as NotifyState; // 'default' | 'granted' | 'denied'
}

/** 请求通知权限（必须在用户手势的调用栈里调用，如点击开关按钮）；异常按 denied 处理 */
export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!notifySupported()) return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

let lastPlain: Notification | null = null;

/** 发一条通知；页面可见时不打扰，返回是否真的发了 */
export async function sendNotification(title: string, body: string, tag = 'pet'): Promise<boolean> {
  if (!notifySupported() || Notification.permission !== 'granted') return false;
  if (document.visibilityState !== 'hidden') return false;
  try {
    const reg = typeof navigator !== 'undefined' ? await navigator.serviceWorker?.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, { body, tag, silent: false });
      return true;
    }
    lastPlain?.close();
    lastPlain = new Notification(title, { body, tag });
    window.setTimeout(() => lastPlain?.close(), 8_000);
    return true;
  } catch {
    return false;
  }
}

/** 用户回到前台：清掉未读通知（SW 渠道按 tag 清，页面内直接关） */
export async function clearNotifications(tag = 'pet'): Promise<void> {
  try {
    lastPlain?.close();
    lastPlain = null;
    const reg = typeof navigator !== 'undefined' ? await navigator.serviceWorker?.getRegistration() : undefined;
    const list = await reg?.getNotifications({ tag });
    for (const n of list ?? []) n.close();
  } catch {
    /* 静默 */
  }
}
