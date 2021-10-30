import { Injectable, Logger } from '@nestjs/common';
import { DiscordClientProvider, On, Once, OnCommand } from 'discord-nestjs';
import { Message } from 'discord.js';
import * as humanizeDuration from 'humanize-duration';
import * as os from 'os';
import { Config } from '../config';
import { MultiImageSearchService } from '../multi-image-search/multi-image-search.service';
import { Repository } from 'typeorm';
import { Urls } from '../entity';
import { InjectRepository } from '@nestjs/typeorm';
import { YoutubeNotifyService } from './youtube-notify.service';

@Injectable()
export class BotGateway {
  private readonly logger = new Logger(BotGateway.name);
  constructor(
    private readonly discord: DiscordClientProvider,
    private readonly config: Config,
    private readonly imageSearchService: MultiImageSearchService,
    @InjectRepository(Urls)
    private readonly urls: Repository<Urls>,
    private readonly ytNotifyService: YoutubeNotifyService,
  ) {}

  @Once({ event: 'ready' })
  async onReady(): Promise<void> {
    this.logger.log(`Logged in as ${this.discord.getClient().user.tag}!`);
    await this.ytNotifyService.start();
  }

  @OnCommand({ name: 'ping', isIgnoreBotMessage: true })
  async pingCommand(ctx: Message): Promise<void> {
    await ctx.reply(`🏓Latency is ${Date.now() - ctx.createdTimestamp}ms`);
  }

  @OnCommand({ name: 'uptime', isIgnoreBotMessage: true })
  async uptimeCommand(ctx: Message): Promise<void> {
    await ctx.reply(
      `\`System uptime: ${humanizeDuration(Math.round(os.uptime() * 1000))}\``,
    );
  }

  @OnCommand({ name: 'uptimerem', isIgnoreBotMessage: true })
  async uptimeremCommand(ctx: Message): Promise<void> {
    await ctx.reply(
      `\`Rem uptime: ${humanizeDuration(
        Math.round(process.uptime() * 1000),
      )}\``,
    );
  }

  @OnCommand({ name: 'me', isIgnoreBotMessage: true })
  async meCommand(ctx: Message): Promise<void> {
    await ctx.reply(ctx.author.id);
  }

  @OnCommand({ name: 'hostname' })
  async hostnameCommand(ctx: Message): Promise<void> {
    if (ctx.author.id !== this.config.owner) return;
    await ctx.reply(os.hostname());
  }

  @OnCommand({ name: 'say' })
  async sayCommand(ctx: Message): Promise<void> {
    // noinspection ES6MissingAwait
    ctx.delete();
    await ctx.channel.send(ctx.content.substr(4));
  }

  @On({ event: 'message' })
  async onMessage(ctx: Message): Promise<void> {
    if (!(ctx.content === 'วาป' || ctx.content === 'ซอส')) return;

    const editableMsg = await ctx.channel.send('Searching ...');
    try {
      const msgs = await ctx.channel.messages.fetch({
        before: ctx.id,
        limit: 3,
      });

      let foundMsg = false;
      for (const [, msg] of msgs.filter((x) => x.author.id === ctx.author.id)) {
        const attachment = msg.attachments.first();
        if (attachment && attachment.width > 0 && attachment.height > 0) {
          const thumbUrl = `${
            attachment.proxyURL
          }?width=${256}&height=${Math.round(
            256 * (attachment.height / attachment.width),
          )}`;

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
              embed: {
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
}
