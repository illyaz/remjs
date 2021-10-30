import { Injectable, Logger } from '@nestjs/common';
import { DiscordClientProvider } from '@discord-nestjs/core';
import { Config } from '../config';
import {
  VTrackerNotifyClient,
  YoutubeVideoNotifyPayload,
} from './vtracker-notify-client';
import { join } from 'path';
import { promisify } from 'util';
import * as fs from 'fs';
import {
  Channel,
  GuildChannel,
  MessageEmbed,
  TextChannel,
  User,
} from 'discord.js';
import * as nlp from 'wink-nlp-utils';

const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

enum SendTos {
  user,
  channel,
}

enum SendModes {
  all,
  music,
  music_live,
  music_normal,
  available,
}

enum SendTypes {
  raw,
  th,
}

@Injectable()
export class YoutubeNotifyService {
  private readonly logger = new Logger(YoutubeNotifyService.name);
  private notifyClients: { [key: string]: VTrackerNotifyClient } = {};
  private sendMetas: {
    [key: string]: {
      id: string;
      to: SendTos;
      mode: SendModes;
      type: SendTypes;
    }[];
  } = {};

  private readonly continuationPath = join(
    __dirname,
    '..',
    '..',
    'continuation',
  );

  constructor(
    private readonly discord: DiscordClientProvider,
    private readonly config: Config,
  ) {
    // this.socketClient[''] = new VTrackerNotifyClient();
  }

  async start(): Promise<void> {
    if (!(await YoutubeNotifyService.isExists(this.continuationPath)))
      await mkdir(this.continuationPath);

    for (const key in this.config.notifications) {
      this.sendMetas[key] = this.config.notifications[key].send.map(
        YoutubeNotifyService.parseSend,
      );

      const client = new VTrackerNotifyClient(
        this.config.vtrackerEndpoint,
        key,
        this.config.notifications[key].id,
        this.config.notifications[key].token,
        async () => await this.readContinuation(key),
        async (i) => await this.writeContinuation(key, i),
      );

      client.on('notify', (data) => this.onNotify.bind(this)(key, data));

      this.notifyClients[key] = client;
    }

    for (const key in this.notifyClients) {
      this.notifyClients[key].start();
    }
  }

  private async onNotify(key: string, data: YoutubeVideoNotifyPayload) {
    for (const meta of this.sendMetas[key]) {
      if (
        !(
          meta.mode == SendModes.all ||
          (meta.mode == SendModes.music_live &&
            (data.type === 'liveScheduled' || data.type === 'liveStarted')) ||
          (meta.mode == SendModes.music_normal &&
            (data.type === 'premiereScheduled' ||
              data.type === 'premiereStarted' ||
              data.type === 'uploaded')) ||
          ((meta.mode == SendModes.available || meta.mode == SendModes.music) &&
            (data.type === 'liveStarted' ||
              data.type === 'premiereStarted' ||
              data.type === 'uploaded'))
        )
      )
        continue;

      if (SendModes[meta.mode].startsWith('music') && !this.isMusic(data))
        continue;

      const embed = this.getEmbed(data);
      if (meta.type == SendTypes.th) {
        embed.footer.text = data.isTest ? '[ทดสอบ] ' : '';
        if (data.type === 'liveStarted') embed.footer.text += 'แจ้งเตือนไลฟ์';
        else if (data.type === 'premiereStarted')
          embed.footer.text += 'แจ้งเตือนเปิดตัวคลิป';
        else embed.footer.text += 'แจ้งเตือนอัปโหลด';
      }

      try {
        const to =
          meta.to == SendTos.user
            ? await this.getUser(meta.id)
            : await this.getChannel(meta.id);

        try {
          if (to instanceof User) await to.send({ embeds: [embed] });
          else if (to instanceof TextChannel)
            await to.send({ embeds: [embed] });
          this.logNotify(key, data, to);
        } catch (e) {
          this.logNotifyException(key, data, to, e);
        }
      } catch (e) {
        console.log(e);
      }
    }
  }

  private async readContinuation(key: string): Promise<number> {
    const path = join(this.continuationPath, key);
    if (await YoutubeNotifyService.isExists(path))
      return await readFile(path).then(Number);

    return Date.now();
  }

  private async writeContinuation(key: string, value: number) {
    await writeFile(join(this.continuationPath, key), value.toString());
  }

  private static parseSend(str: string): {
    id: string;
    to: SendTos;
    mode: SendModes;
    type: SendTypes;
  } {
    const [to, id, mode, type] = str.split(':', 4);

    if (SendTos[to] === undefined)
      throw new Error('unknown send string/to: ' + str);

    if (SendModes[mode] === undefined)
      throw new Error('unknown send string/mode: ' + str);

    if (SendTypes[type] === undefined)
      throw new Error('unknown send string/type: ' + str);

    return {
      id,
      to: SendTos[to],
      mode: SendModes[mode],
      type: SendTypes[type],
    };
  }

  private static async isExists(dir: string) {
    try {
      await stat(dir);
      return true;
    } catch (e) {
      if (e.code === 'ENOENT') return false;
      throw e;
    }
  }

  private isAvailable = (data: YoutubeVideoNotifyPayload) => {
    switch (data.type) {
      case 'liveEnded':
      case 'liveScheduled':
      case 'premiereScheduled':
      case 'premiereEnded':
        return false;
      default:
        return true;
    }
  };

  private isMusic = (data: YoutubeVideoNotifyPayload) => {
    const t = data.videoTitle.toLowerCase();
    const musicList = [
      '歌',
      '曲',
      '公式mv',
      'original mv',
      'オリジナルmv',
      'アニソン',
      'うた',
      'カバー',
      'アコギ',
      'official video',
      '불러보',
    ];

    const musicList0 = [
      'MV',
      'SING',
      'SONG',
      'VOCALOID',
      'ร้อง',
      'เพลง',
      'คาราโอเกะ',
    ];

    const musicList1 = [
      'anisong',
      'sing',
      'singing',
      'sang',
      'song',
      'karaoke',
      'music',
      'cover',
      'covered',
      'piano',
      'guitar',
    ];

    const tokenizedTitle = nlp.string
      .tokenize(data.videoTitle)
      .map((s) => s.toLowerCase());

    return (
      musicList0.some((s) => data.videoTitle.includes(s)) ||
      musicList1.some((s) => tokenizedTitle.includes(s)) ||
      musicList.some((s) => t.includes(s))
    );
  };

  private getEmbed = (data: YoutubeVideoNotifyPayload): MessageEmbed =>
    new MessageEmbed({
      title: data.videoTitle,
      url: `https://youtu.be/${data.videoId}`,
      color: this.isAvailable(data) ? 0xff0000 : 0x242424,
      timestamp: this.getEmbedTimestamp(data),
      footer: {
        iconURL: 'https://i.imgur.com/DreZpdG.png',
        text: (data.isTest ? '[TEST] ' : '') + data.type,
      },
      thumbnail: {
        url: data.thumbnails.high || data.thumbnails.default,
      },
      author: {
        name: data.channelTitle,
        url: `https://www.youtube.com/channel/${data.channelId}`,
        iconURL: data.channelIcon,
      },
    });

  private getEmbedTimestamp = (data: YoutubeVideoNotifyPayload) => {
    switch (data.type) {
      case 'liveScheduled':
      case 'premiereScheduled':
        return new Date(data.liveStreamingDetail.scheduledStartTime).getTime();
      case 'liveStarted':
      case 'premiereStarted':
        return new Date(data.liveStreamingDetail.actualStartTime).getTime();
      case 'liveEnded':
      case 'premiereEnded':
        return new Date(data.liveStreamingDetail.actualEndTime).getTime();
      default:
        return Date.now();
    }
  };

  private getUser = async (id) =>
    this.discord.getClient().users.cache.get(id) ??
    (await this.discord.getClient().users.fetch(id, { cache: true }));

  private getChannel = async (id) =>
    (this.discord.getClient().channels.cache.get(id) ??
      (await this.discord
        .getClient()
        .channels.fetch(id, { cache: true }))) as GuildChannel;

  private getShort = (data: YoutubeVideoNotifyPayload) => {
    switch (data.type) {
      case 'liveScheduled':
        return 'LIVE +';
      case 'liveStarted':
        return 'LIVE *';
      case 'liveEnded':
        return 'LIVE -';
      case 'premiereScheduled':
        return 'PREM +';
      case 'premiereStarted':
        return 'PREM *';
      case 'premiereEnded':
        return 'PREM -';
      default:
        return 'UPLD  ';
    }
  };

  private logNotify = (
    key: string,
    data: YoutubeVideoNotifyPayload,
    obj: GuildChannel | User,
  ) => {
    const ident = obj
      ? obj instanceof GuildChannel
        ? `[${obj.id}] ${obj.name}`
        : `${obj.username}#${obj.discriminator}`
      : 'UNKNOWN';
    this.logger.log(
      key.padEnd(16) +
        ' ' +
        ident.padEnd(35) +
        ' ' +
        this.getShort(data) +
        ' ' +
        data.channelTitle.replace(/(.{30})..+/, '$1…').padEnd(30) +
        ' ' +
        data.videoId +
        ' ' +
        data.videoTitle.replace(/(.{30})..+/, '$1…') +
        ' ',
    );
  };

  private logNotifyException = (
    key: string,
    data: YoutubeVideoNotifyPayload,
    obj: GuildChannel | User,
    e: Error,
  ) => {
    const ident = obj
      ? obj instanceof Channel
        ? `[${obj.id}] ${obj.name}`
        : `${obj.username}#${obj.discriminator}`
      : 'UNKNOWN';
    this.logger.log(
      key.padEnd(16) +
        ' ' +
        'FAILED' +
        ' ' +
        ident.padEnd(35) +
        ' ' +
        this.getShort(data) +
        ' ' +
        data.channelTitle.replace(/(.{30})..+/, '$1…').padEnd(30) +
        ' ' +
        data.videoId +
        ' ' +
        data.videoTitle.replace(/(.{30})..+/, '$1…') +
        ' ' +
        e,
    );
  };
}
