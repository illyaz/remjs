import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { Config } from '../config';
import { BotGateway } from './bot.gateway';
import { MultiImageSearchModule } from '../multi-image-search/multi-image-search.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Urls } from '../entity';
import { YoutubeNotifyService } from './youtube-notify.service';
import { Intents } from 'discord.js';
import { CommandModule } from './command.module';

@Module({
  imports: [
    DiscordModule.forRootAsync({
      inject: [Config],
      imports: [CommandModule],
      useFactory: (config: Config) => ({
        token: config.token,
        commands: ['**/*.command.js'],
        discordClientOptions: {
          intents: [
            Intents.FLAGS.GUILDS,
            Intents.FLAGS.GUILD_MESSAGES,
            Intents.FLAGS.DIRECT_MESSAGES,
          ],
          partials: ['CHANNEL'],
        },
        registerCommandOptions: config.notificationManageGuildIds.map(
          (forGuild) => ({ forGuild }),
        ),
      }),
    }),
    MultiImageSearchModule,
    TypeOrmModule.forFeature([Urls]),
  ],
  providers: [BotGateway, YoutubeNotifyService],
})
export class BotModule {}
