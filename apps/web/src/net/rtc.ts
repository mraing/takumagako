/**
 * WebRTC Transport：信令（WebSocket）配对 + DataChannel 纯 P2P 数据层（§8.1）。
 * - host：create_room → peer_joined → offer/answer/ice → DataChannel
 * - guest：join → 收 offer → answer → ICE
 * - 信令地址取 location.hostname（局域网手机访问也直连同一台主机）
 */
import { decodeSignal, encodeSignal, type SignalMsg } from '@takumagako/protocol';

export type NetState = 'idle' | 'signaling' | 'connecting' | 'connected' | 'closed' | 'error';

const SIGNALING_PORT = 8787;
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export type NetEvent =
  | { kind: 'state'; state: NetState }
  | { kind: 'room'; code: string }
  | { kind: 'message'; raw: string }
  | { kind: 'error'; reason: string };

export class RtcTransport {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];

  roomCode: string | null = null;

  constructor(private readonly emit: (e: NetEvent) => void) {}

  // ---- 公共 ----

  /** 房主：建房，等客人加入后自动走 offer 流程 */
  async host(): Promise<void> {
    this.setState('signaling');
    await this.openSignaling();
    this.sendSignal({ t: 'create_room' });
  }

  /** 客人：加入房间，等待对方 offer */
  async join(code: string): Promise<void> {
    this.roomCode = code;
    this.setState('connecting');
    await this.openSignaling();
    this.sendSignal({ t: 'join', room: code });
  }

  send(raw: string): void {
    if (this.dc?.readyState === 'open') this.dc.send(raw);
  }

  close(): void {
    this.dc?.close();
    this.dc = null;
    this.pc?.close();
    this.pc = null;
    this.ws?.close();
    this.ws = null;
    this.pendingIce = [];
    this.emit({ kind: 'state', state: 'idle' });
  }

  // ---- 信令 ----

  private signalingUrl(): string {
    return `ws://${location.hostname || 'localhost'}:${SIGNALING_PORT}`;
  }

  private openSignaling(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.signalingUrl());
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => {
        this.emit({ kind: 'error', reason: '连不上信令服务器（8787 端口）' });
        reject(new Error('signaling-unreachable'));
      };
      ws.onclose = () => {
        if (this.dc?.readyState !== 'open') this.emit({ kind: 'state', state: 'closed' });
      };
      ws.onmessage = (ev) => {
        this.onSignal(decodeSignal(String(ev.data)));
      };
    });
  }

  private sendSignal(m: SignalMsg): void {
    this.ws?.send(encodeSignal(m));
  }

  private onSignal(m: SignalMsg): void {
    switch (m.t) {
      case 'room_created':
        this.roomCode = m.room;
        this.emit({ kind: 'room', code: m.room });
        break;
      case 'joined':
        this.roomCode = m.room;
        break;
      case 'peer_joined':
        void this.startHostOffer();
        break;
      case 'offer':
        void this.acceptOffer(m.sdp);
        break;
      case 'answer':
        void this.pc?.setRemoteDescription(JSON.parse(m.sdp));
        break;
      case 'ice': {
        const cand = JSON.parse(m.candidate) as RTCIceCandidateInit;
        if (this.pc?.remoteDescription) void this.pc.addIceCandidate(cand).catch(() => {});
        else this.pendingIce.push(cand);
        break;
      }
      case 'peer_left':
      case 'room_gone':
        this.close();
        this.emit({ kind: 'error', reason: m.t === 'peer_left' ? '对方离开了' : '房间已失效' });
        break;
      case 'error':
        this.emit({ kind: 'error', reason: m.reason });
        break;
      default:
        break;
    }
  }

  // ---- WebRTC ----

  private setState(s: NetState): void {
    this.emit({ kind: 'state', state: s });
  }

  private newPeer(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal({ t: 'ice', candidate: JSON.stringify(e.candidate.toJSON()) });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.setState('connected');
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.setState('error');
        this.emit({ kind: 'error', reason: '连接断开' });
      }
    };
    return pc;
  }

  private attachChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => {
      const queued = this.pendingIce.splice(0);
      for (const c of queued) void this.pc?.addIceCandidate(c).catch(() => {});
      this.setState('connected');
    };
    dc.onmessage = (e) => this.emit({ kind: 'message', raw: String(e.data) });
    dc.onclose = () => this.setState('closed');
  }

  /** 房主：客人加入后创建 DataChannel 并发起 offer */
  private async startHostOffer(): Promise<void> {
    const pc = this.newPeer();
    this.setState('connecting');
    const dc = pc.createDataChannel('takumagako');
    this.attachChannel(dc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.sendSignal({ t: 'offer', sdp: JSON.stringify(pc.localDescription) });
  }

  /** 客人：收到 offer → answer；对端 DataChannel 由 ondatachannel 接管 */
  private async acceptOffer(sdp: string): Promise<void> {
    const pc = this.newPeer();
    pc.ondatachannel = (e) => this.attachChannel(e.channel);
    this.setState('connecting');
    await pc.setRemoteDescription(JSON.parse(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.sendSignal({ t: 'answer', sdp: JSON.stringify(pc.localDescription) });
    for (const c of this.pendingIce.splice(0)) {
      void pc.addIceCandidate(c).catch(() => {});
    }
  }
}
