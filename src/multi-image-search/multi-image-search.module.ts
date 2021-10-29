import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { Config } from '../config';
import { MultiImageSearchService } from './multi-image-search.service';
import * as searchProviders from './providers';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Urls } from '../entity';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [Config],
      useFactory: (config: Config) => ({
        headers: {
          'User-Agent': config.userAgent,
        },
      }),
    }),
    TypeOrmModule.forFeature([Urls]),
  ],
  providers: [MultiImageSearchService, ...Object.values(searchProviders)],
  exports: [MultiImageSearchService, ...Object.values(searchProviders)],
})
export class MultiImageSearchModule {}
