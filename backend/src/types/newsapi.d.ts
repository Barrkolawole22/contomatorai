declare module 'newsapi' {
  interface NewsAPIOptions {
    q?: string;
    sources?: string;
    domains?: string;
    from?: string;
    to?: string;
    language?: string;
    sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
    pageSize?: number;
    page?: number;
    country?: string;
    category?: string;
  }

  interface NewsAPIArticle {
    source: { id: string | null; name: string };
    author: string | null;
    title: string;
    description: string | null;
    url: string;
    urlToImage: string | null;
    publishedAt: string;
    content: string | null;
  }

  interface NewsAPIResponse {
    status: string;
    totalResults: number;
    articles: NewsAPIArticle[];
  }

  class NewsAPI {
    constructor(apiKey: string);
    v2: {
      topHeadlines(options: NewsAPIOptions): Promise<NewsAPIResponse>;
      everything(options: NewsAPIOptions): Promise<NewsAPIResponse>;
      sources(options: NewsAPIOptions): Promise<{ status: string; sources: any[] }>;
    };
  }

  export = NewsAPI;
}