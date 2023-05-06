import { HttpStatus, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { Config } from '../config';
import { MessageEmbed } from 'discord.js';

export interface Channel {
  id: string;
  title: string;
  avatar: string;
}

export interface Video {
  id: string;
  title: string;
  status: 'published' | 'ongoing' | 'upcoming';
  type: 'upload' | 'live' | 'premiere';
}

@Injectable()
export class CommandService {
  constructor(
    private readonly http: HttpService,
    private readonly config: Config,
  ) {
    console.log(this.config);
  }

  // Ref: https://stackoverflow.com/a/27728417
  getVideoIdFromUrl(urlString: string): string {
    const rx =
      /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
    return urlString.match(rx)?.[1];
  }

  async getChannelIdFromUrl(urlString: string) {
    if (urlString.length === 24) return urlString;
    const url = new URL(urlString);

    const paths = url.pathname.split('/').filter(Boolean);

    if (
      url.host === 'youtube.com' ||
      url.host === 'm.youtube.com' ||
      url.host === 'www.youtube.com' ||
      url.host === 'youtu.be'
    ) {
      if (paths.length >= 2 && paths[0] === 'channel') return paths[1];

      if (
        (paths.length >= 2 && (paths[0] === 'c' || paths[0] === 'user')) ||
        paths?.[0]?.startsWith('@')
      ) {
        const html = await lastValueFrom(this.http.get(url.toString())).then(
          (x) => x.data.toString(),
        );

        const m =
          /<meta itemprop="(channelId|identifier)" content="(?<id>.{24})">/.exec(
            html,
          );
        if (m?.groups?.id) return m.groups.id;
      } else {
        const oembedRes = await lastValueFrom(
          this.http.get(
            `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
              url.toString(),
            )}`,
          ),
        );

        if (oembedRes.status == 200) {
          const oembed = await oembedRes.data;
          return await this.getChannelIdFromUrl(oembed.author_url);
        } else {
          const html = await lastValueFrom(this.http.get(url.toString())).then(
            (x) => x.data.toString(),
          );
          const m =
            /<meta itemprop="(channelId|identifier)" content="(?<id>.{24})">/.exec(
              html,
            );
          if (m?.groups?.id) return m.groups.id;
        }
      }
    }
  }

  async getChannel(channelId: string): Promise<Channel | undefined> {
    const res = await lastValueFrom(
      this.http.get(
        `${this.config.vtrackerEndpoint}/v1/channels/youtube/${channelId}`,
        {
          validateStatus: (s) =>
            s === HttpStatus.NOT_FOUND || s === HttpStatus.OK,
        },
      ),
    );

    return res.status === HttpStatus.OK ? res.data : undefined;
  }

  async getVideo(videoId: string): Promise<Video | undefined> {
    const res = await lastValueFrom(
      this.http.get(
        `${this.config.vtrackerEndpoint}/v1/videos/youtube/${videoId}`,
        {
          validateStatus: (s) =>
            s === HttpStatus.NOT_FOUND || s === HttpStatus.OK,
        },
      ),
    );

    return res.status === HttpStatus.OK ? res.data : undefined;
  }

  async subscribe(url: string): Promise<{
    isAlreadySubscribed: boolean;
    channel: Channel;
  }> {
    const all = this.config.notifications['all'];
    if (!all) throw new Error('required notification token `all`');

    const channelId = await this.getChannelIdFromUrl(url);
    if (!channelId)
      throw new Error(`can't extract channel id from url <${url}>`);

    const res = await lastValueFrom(
      this.http.post(
        `${
          this.config.vtrackerEndpoint
        }/v2/channels/youtube/${channelId}?bearer=${encodeURIComponent(
          all.token,
        )}`,
        undefined,
        {
          validateStatus: (s) =>
            s === HttpStatus.CREATED || s === HttpStatus.CONFLICT,
        },
      ),
    );

    if (
      res.status === HttpStatus.CREATED ||
      res.status === HttpStatus.CONFLICT
    ) {
      const channel = await lastValueFrom(
        this.http.get<Channel>(
          `${
            this.config.vtrackerEndpoint
          }/v2/channels/youtube/${channelId}?bearer=${encodeURIComponent(
            all.token,
          )}`,
        ),
      ).then((x) => x.data);
      return {
        isAlreadySubscribed: res.status === HttpStatus.CONFLICT,
        channel,
      };
    } else if (res.status === HttpStatus.NOT_FOUND)
      throw new Error('channel not exists');
    else throw new Error('unknown error: ' + res.status);
  }

  async unsubscribe(url: string): Promise<{
    isAlreadyUnsubscribed: boolean;
    channel: Channel;
  }> {
    const all = this.config.notifications['all'];
    if (!all) throw new Error('required notification token `all`');

    const channelId = await this.getChannelIdFromUrl(url);
    if (!channelId)
      throw new Error(`can't extract channel id from url <${url}>`);

    const res = await lastValueFrom(
      this.http.delete(
        `${this.config.vtrackerEndpoint}/v2/notifications/${
          all.id
        }/v2/channels/${channelId}?bearer=${encodeURIComponent(all.token)}`,

        { validateStatus: (s) => s === 204 || s === 400 },
      ),
    );

    if (res.status === 204 || res.status === 400) {
      const channel = await lastValueFrom(
        this.http.get<Channel>(
          `${
            this.config.vtrackerEndpoint
          }/v2/channels/youtube/${channelId}?bearer=${encodeURIComponent(
            all.token,
          )}`,
        ),
      ).then((x) => x.data);
      return { isAlreadyUnsubscribed: res.status === 400, channel };
    } else if (res.status === 404) throw new Error('channel not exists');
    else throw new Error('unknown error: ' + res.status);
  }

  createSubscribeEmbed(
    isAlreadySubscribed: boolean,
    channel: Channel,
  ): MessageEmbed {
    return new MessageEmbed({
      title: channel.title,
      url: `https://www.youtube.com/channel/${channel.id}`,
      thumbnail: {
        url: channel.avatar,
      },
      color: isAlreadySubscribed ? 0xff0000 : 0x4169e1,
      author: {
        name: isAlreadySubscribed ? 'Already subscribed' : 'Subscribed',
      },
    });
  }

  createUnsubscribeEmbed(
    isAlreadyUnsubscribed: boolean,
    channel: Channel,
  ): MessageEmbed {
    return new MessageEmbed({
      title: channel.title,
      url: `https://www.youtube.com/channel/${channel.id}`,
      thumbnail: {
        url: channel.avatar,
      },
      color: isAlreadyUnsubscribed ? 0xff0000 : 0x4169e1,
      author: {
        name: isAlreadyUnsubscribed ? 'Already unsubscribed' : 'Unsubscribed',
      },
    });
  }
}
