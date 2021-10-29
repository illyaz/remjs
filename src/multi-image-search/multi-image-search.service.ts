import { Injectable } from '@nestjs/common';
import { Config } from '../config';
import { SauceNaoProvider } from './providers';

@Injectable()
export class MultiImageSearchService {
  constructor(
    private readonly config: Config,
    private sauceNao: SauceNaoProvider,
  ) {}

  async search(
    thumbUrl: string,
  ): Promise<{ similarity: number; url: string; extra: any }[]> {
    const results = await Promise.all(
      [this.sauceNao].map((x) => x.search(thumbUrl)),
    ).then((x) => x.flat());

    const newResults = [];
    for (const result of results) {
      let found = false;
      for (const newResult of newResults) {
        if (new URL(newResult.url).pathname == new URL(result.url).pathname)
          found = true;
      }

      if (!found) newResults.push(result);
    }

    newResults.sort(function (x, y) {
      return y.similarity - x.similarity;
    });

    return newResults;
  }
}
