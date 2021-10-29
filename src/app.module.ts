import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { fileLoader, TypedConfigModule } from 'nest-typed-config';
import { Config } from './config';
import { BotModule } from './bot/bot.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Urls } from './entity';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    TypedConfigModule.forRoot({
      schema: Config,
      load: fileLoader(),
    }),
    TypeOrmModule.forRootAsync({
      inject: [Config],
      useFactory: (config: Config) => ({
        type: 'sqlite',
        database: config.database,
        entities: [Urls],
      }),
    }),
    TypeOrmModule.forFeature([Urls]),
    ServeStaticModule.forRoot({
      renderPath: '/',
      rootPath: join(__dirname, '..', 'static'),
    }),
    BotModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
