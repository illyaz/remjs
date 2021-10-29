export interface ImageSearchProvider {
  search(
    thumbUrl: string,
  ): Promise<{ similarity: number; url: string; extra: any }[]>;
}
