import { Module } from '@nestjs/common';
import { DiscordModule } from 'discord-nestjs';
import { Config } from '../config';
import { BotGateway } from './bot.gateway';
import { MultiImageSearchModule } from '../multi-image-search/multi-image-search.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Urls } from '../entity';

@Module({
  imports: [
    DiscordModule.forRootAsync({
      inject: [Config],
      useFactory: (config: Config) => ({
        token: config.token,
        commandPrefix: config.prefix,
      }),
    }),
    MultiImageSearchModule,
    TypeOrmModule.forFeature([Urls]),
  ],
  providers: [BotGateway],
})
export class BotModule {}
