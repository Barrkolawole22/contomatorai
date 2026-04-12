// backend/src/types/wordpress.types.ts - New file for WordPress types
export interface WordPressSite {
  _id: string;
  name: string;
  url: string;
  apiUrl: string;
  username: string;
  isActive: boolean;
  categories: WordPressCategory[];
  tags: WordPressTag[];
  lastSync?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

export interface WordPressTag {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

export interface WordPressPost {
  id: number;
  title: string;
  excerpt: string;
  date: string;
  modified: string;
  link: string;
  status: string;
  categories: number[];
  tags: number[];
  author: string;
}

export interface WordPressPublishOptions {
  status?: 'publish' | 'draft' | 'private' | 'future';
  categories?: number[];
  tags?: number[];
  featuredImage?: string;
  publishDate?: Date;
  meta?: Record<string, any>;
}