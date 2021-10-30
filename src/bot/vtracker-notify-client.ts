import { client as WebSocketClient, connection, Message } from 'websocket';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

export type Payload =
  | ReadyPayload
  | HeartbeatPayload
  | YoutubeVideoNotifyPayload;

export interface ReadyPayload {
  op: 'ready';
  connectionId: string;
  traceId: string;
  userId: string;
  heartbeatInterval: number;
  heartbeatTimeout: number;
}

export interface HeartbeatPayload {
  op: 'heartbeat';
  timestamp: number;
}

export interface YoutubeVideoNotifyPayload {
  op: 'youtubeVideoNotify';
  isTest: boolean | null;
  videoId: string;
  videoTitle: string;
  channelId: string;
  channelTitle: string;
  channelIcon: string;
  thumbnails: Thumbnails;
  liveStreamingDetail: LiveStreamingDetail | null;
  type:
    | 'uploaded'
    | 'liveScheduled'
    | 'liveStarted'
    | 'liveEnded'
    | 'premiereScheduled'
    | 'premiereStarted'
    | 'premiereEnded';
  triggeredProperties: string[] | null;
  timestamp: number;
}

export interface LiveStreamingDetail {
  actualStartTime: Date | null;
  actualEndTime: Date | null;
  scheduledStartTime: Date | null;
  scheduledEndTime: Date | null;
  concurrentViewers: Date | null;
}

export interface Thumbnails {
  default: string | null;
  medium: string | null;
  high: string | null;
  standard: string | null;
  maxRes: string | null;
}

export class VTrackerNotifyClient extends EventEmitter {
  private readonly logger = new Logger(VTrackerNotifyClient.name);
  private readonly ws = new WebSocketClient();
  private client: connection;
  private continuation: number;
  private attempts = 0;
  private wsHeartbeatHandle: NodeJS.Timer;

  constructor(
    private readonly endpoint: string,
    private readonly name: string,
    private readonly id: number,
    private readonly token: string,
    private readonly readContinuation: () => Promise<number>,
    private readonly writeContinuation: (continuation: number) => Promise<void>,
  ) {
    super();

    this.connect = this.connect.bind(this);
    this.onConnect = this.onConnect.bind(this);
    this.onConnectFailed = this.onConnectFailed.bind(this);
    this.onClientMessage = this.onClientMessage.bind(this);
    this.onClientClose = this.onClientClose.bind(this);

    this.ws.on('connect', this.onConnect);
    this.ws.on('connectFailed', this.onConnectFailed);
  }

  private onConnect(c: connection) {
    this.attempts = 0;
    this.client = c;
    this.logger.log(`[${this.name}] Connected to notification server`);

    // If not receive ready payload within 10 seconds, close!
    setTimeout(() => {
      if (!this.wsHeartbeatHandle) this.client.close();
    }, 10000);

    c.on('message', this.onClientMessage);
    c.on('close', this.onClientClose);
  }

  private onConnectFailed(e: Error) {
    this.logger.error(
      `[${this.name}] socket connect failed (${this.attempts})`,
      e,
    );
    setTimeout(this.connect, 1000);
  }

  private async connect() {
    this.attempts++;
    this.ws.connect(await this.getEndpoint());
  }

  private async onClientMessage(msg: Message) {
    if (msg.type != 'utf8') return;

    const payload = JSON.parse(msg.utf8Data) as Payload;

    switch (payload.op) {
      case 'ready':
        this.logger.log(
          `[${this.name}] Ready: connectionId ${payload.connectionId}, userId ${payload.userId}`,
        );

        this.wsHeartbeatHandle = global.setInterval(() => {
          this.client.sendUTF(
            JSON.stringify({
              op: 'heartbeat',
              timestamp: Date.now(),
            } as HeartbeatPayload),
          );
        }, payload.heartbeatInterval);

        this.emit('ready', payload);
        break;
      case 'youtubeVideoNotify':
        await this.writeContinuation((this.continuation = payload.timestamp));
        this.emit('notify', payload);
        break;
    }
  }

  private onClientClose(code: number, desc: string) {
    global.clearInterval(this.wsHeartbeatHandle);
    this.wsHeartbeatHandle = undefined;
    this.logger.log(`[${this.name}] closed ${code}, ${desc}`);
    setTimeout(this.connect, 1000);
  }

  async start() {
    this.continuation = await this.readContinuation();
    await this.connect();
  }

  private async getEndpoint(): Promise<string> {
    const url = new URL(this.endpoint);
    url.protocol = url.protocol.replace('http', 'ws');

    return `${url}/notifications/listen?id=${
      this.id
    }&compatible=notifier&continuation=${
      this.continuation
    }&bearer=${encodeURIComponent(this.token)}`;
  }
}

export declare interface VTrackerNotifyClient {
  on(event: 'ready', cb: (data: ReadyPayload) => void): this;
  on(event: 'notify', cb: (data: YoutubeVideoNotifyPayload) => void): this;
}
