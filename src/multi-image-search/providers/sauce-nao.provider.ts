import { ImageSearchProvider } from './image-search.provider';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Config } from '../../config';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class SauceNaoProvider implements ImageSearchProvider {
  constructor(
    private readonly config: Config,
    private readonly http: HttpService,
  ) {}

  async search(
    thumbUrl: string,
  ): Promise<{ similarity: number; url: string; extra: any }[]> {
    const response = await lastValueFrom(
      this.http.get('https://saucenao.com/search.php', {
        params: {
          api_key: this.config.sauceNaoApiKey,
          output_type: 2,
          url: thumbUrl,
        },
      }),
    );

    const results = [];
    if (response.data.results) {
      for (const result of response.data.results) {
        if (result.data.ext_urls && result.data.ext_urls.length > 0) {
          results.push({
            similarity: parseFloat(result.header.similarity),
            url: result.data.ext_urls[0],
            extra: result,
          });
        }
      }
    }
    return results;
  }
}
