import { Injectable } from '@nestjs/common';
import { ImageSearchProvider } from './image-search.provider';
import { Config } from '../../config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class MoebooruProvider implements ImageSearchProvider {
  constructor(
    private readonly config: Config,
    private readonly http: HttpService,
  ) {}

  async search(
    thumbUrl: string,
  ): Promise<{ similarity: number; url: string; extra: any }[]> {
    const response = await lastValueFrom(
      this.http.post(
        'https://yande.re/post/similar',
        {
          services: 'all',
          url: thumbUrl,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      ),
    );

    const results = [];
    if (response.data.success)
      for (const result of response.data.posts) {
        // Is Yande.re
        if (!result.service) {
          results.push({
            similarity: result.similarity,
            url: `https://yande.re/post/show/${result.id}`,
            extra: result,
          });
          if (result.source) {
            try {
              const urlObj = new URL(result.source);
              if (urlObj.host == 'i.pximg.net') {
                const pixivId = urlObj.pathname
                  .substr(urlObj.pathname.lastIndexOf('/') + 1)
                  .split('_')[0];

                results.push({
                  similarity: parseFloat(result.similarity),
                  url: `https://pixiv.net/member_illust.php?mode=medium&illust_id=${pixivId}`,
                  extra: result,
                });
              }
            } catch (e) {
              /* silent */
            }
          }
        } else
          results.push({
            similarity: result.similarity,
            url: result.url,
            extra: result,
          });
      }

    return results;
  }
}
