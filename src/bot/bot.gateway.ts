import { Injectable, Logger } from '@nestjs/common';
import { DiscordClientProvider, On, Once } from '@discord-nestjs/core';
import { Message } from 'discord.js';
import * as humanizeDuration from 'humanize-duration';
import * as os from 'os';
import { Config } from '../config';
import { MultiImageSearchService } from '../multi-image-search/multi-image-search.service';
import { Repository } from 'typeorm';
import { Urls } from '../entity';
import { InjectRepository } from '@nestjs/typeorm';
import { YoutubeNotifyService } from './youtube-notify.service';
import { CommandService, Video } from './command.service';
import * as _linkify from 'linkify-it';

const linkify = _linkify();
@Injectable()
export class BotGateway {
  private readonly logger = new Logger(BotGateway.name);
  private readonly commandMap = {} as Record<
    string,
    (ctx: Message) => Promise<void>
  >;

  constructor(
    private readonly discord: DiscordClientProvider,
    private readonly config: Config,
    private readonly imageSearchService: MultiImageSearchService,
    @InjectRepository(Urls)
    private readonly urls: Repository<Urls>,
    private readonly ytNotifyService: YoutubeNotifyService,
    private readonly commandService: CommandService,
  ) {
    this.commandMap = Object.getOwnPropertyNames(BotGateway.prototype)
      .filter((x) => x.endsWith('Command') && x !== 'processCommand')
      .reduce(
        (p, c) => ({
          ...p,
          [c.slice(0, -7)]: BotGateway.prototype[c].bind(this),
        }),
        {},
      );
  }

  @Once('ready')
  async onReady(): Promise<void> {
    this.logger.log(`Logged in as ${this.discord.getClient().user.tag}!`);
    await this.ytNotifyService.start();
  }

  @On('messageCreate')
  onMessageCreate(ctx: Message) {
    if (ctx.author.bot) return;

    if (ctx.content.startsWith(this.config.prefix))
      // noinspection JSIgnoredPromiseFromCall
      this.processCommand(ctx);
    else if (ctx.content === 'วาป' || ctx.content === 'ซอส')
      // noinspection JSIgnoredPromiseFromCall
      this.findSource(ctx);
    else this.autoCheckNotification(ctx);
  }

  async processCommand(ctx: Message) {
    try {
      const args = ctx.content.substr(this.config.prefix.length).split(' ');
      const commandFunc = this.commandMap[args[0]];
      if (commandFunc) await commandFunc(ctx);
    } catch (e) {
      this.logger.error(e);
      // noinspection ES6MissingAwait
      ctx.reply('Oops something went wrong, please try again later');
    }
  }

  async pingCommand(ctx: Message): Promise<void> {
    await ctx.reply(`Latency is ${Date.now() - ctx.createdTimestamp}ms`);
  }

  async uptimeCommand(ctx: Message): Promise<void> {
    await ctx.reply(
      `\`System uptime: ${humanizeDuration(Math.round(os.uptime() * 1000))}\``,
    );
  }

  async uptimeremCommand(ctx: Message): Promise<void> {
    await ctx.reply(
      `\`Rem uptime: ${humanizeDuration(
        Math.round(process.uptime() * 1000),
      )}\``,
    );
  }

  async meCommand(ctx: Message): Promise<void> {
    await ctx.reply(ctx.author.id);
  }

  async hostnameCommand(ctx: Message): Promise<void> {
    if (ctx.author.id !== this.config.owner) return;
    await ctx.reply(os.hostname());
  }

  async sayCommand(ctx: Message): Promise<void> {
    // noinspection ES6MissingAwait
    ctx.delete();
    await ctx.channel.send(ctx.content.substr(4));
  }

  async findSource(ctx: Message): Promise<void> {
    const editableMsg = await ctx.channel.send('Searching ...');
    try {
      const msgs = await ctx.channel.messages.fetch({
        before: ctx.id,
        limit: 3,
      });
      let foundMsg = false;
      for (const [, msg] of msgs.filter((x) => x.author.id === ctx.author.id)) {
        let attachment = msg.attachments.first();
        if (!attachment)
          attachment = msg.embeds.find((x) => x.type === 'image')
            ?.thumbnail as any;

        if (attachment && attachment.width > 0 && attachment.height > 0) {
          const thumbUrl = `${
            attachment.proxyURL
          }?width=${256}&height=${Math.round(
            256 * (attachment.height / attachment.width),
          )}`;

          this.logger.debug(`Search image using url: ${thumbUrl}`);
          const results = (
            await this.imageSearchService.search(thumbUrl)
          ).filter((x) => x.similarity >= 20);
          if (results.length > 0) {
            const shortedUrls = await this.urls.insert(
              results.map((x) => ({
                url: x.url,
              })),
            );

            for (let i = 0; i < shortedUrls.generatedMaps.length; i++) {
              results[i].extra._urlShortedId =
                shortedUrls.generatedMaps[i].id - 1;
            }

            const description = results
              .map(
                (result) =>
                  `\`${result.similarity.toFixed(2)}%\` [${new URL(
                    result.url,
                  ).hostname.replace('www.', '')}](${this.config.baseUrl}u/${
                    result.extra._urlShortedId
                  })`,
              )
              .join('\n');

            await editableMsg.edit({
              content: null,
              embeds: [
                {
                  description,
                  timestamp: Date.now(),
                  footer: {
                    icon_url: ctx.author.avatarURL({ size: 32 }),
                    text: ctx.author.username,
                  },
                  thumbnail: {
                    url: thumbUrl,
                  },
                  author: {
                    name: 'Search results',
                    url: this.config.baseUrl,
                  },
                },
              ],
            });
          } else {
            await editableMsg.edit('No similarity image found');
          }

          foundMsg = true;
          break;
        }
      }

      if (!foundMsg) await editableMsg.delete();
    } catch (e) {
      // noinspection ES6MissingAwait
      ctx.reply('Oops something went wrong, please try again later');
      this.logger.error(e);
    }
  }

  async autoCheckNotification(ctx: Message): Promise<void> {
    if (
      ctx.author.bot ||
      !(
        this.config.autoCheckNotificationGuildIds.includes(ctx.guildId) ||
        this.config.autoCheckNotificationChannelIds.includes(ctx.channelId)
      )
    )
      return;

    try {
      const url = linkify.match(ctx.content)?.[0]?.url;
      if (url) {
        const vid = this.commandService.getVideoIdFromUrl(url);
        const promises = [
          vid
            ? this.commandService.getVideo(vid).then((video) => ({ video }))
            : Promise.reject(new Error('not_found')),
          this.commandService
            .getChannelIdFromUrl(url)
            .then((id) =>
              id
                ? this.commandService.getChannel(id)
                : Promise.reject(new Error('not_found')),
            )
            .then((channel) => ({ channel })),
        ];

        const res = await Promise.any(promises);
        ctx.react(res.video || res.channel ? '✅' : '❌');

        const video = (await promises[0]).video as Video;

        if (video && video.status === 'upcoming') ctx.react('⏳');
      }
    } catch {}
  }
}
