// backend/src/types/api.types.ts - Updated to match your controllers
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
    current?: number; // Added for your content controller
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

// Updated to match your auth controller response
export interface AuthResponse {
  success: boolean;
  message: string;
  token: string; // Your controller returns single token, not tokens object
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isAdmin?: boolean;
    credits: number; // Changed from usageCredits to credits
  };
}

// Updated to match your content generation form
export interface ContentGenerationRequest {
  keyword: string; // Your form uses single keyword, not keywords array
  siteId: string; // Required in your form
  options?: {
    tone?: 'informative' | 'conversational' | 'professional' | 'friendly' | 'authoritative';
    wordCount?: number;
    includeHeadings?: boolean;
    includeIntroduction?: boolean;
    includeConclusion?: boolean;
    extraInstructions?: string;
  };
}

export interface KeywordResearchRequest {
  seedKeyword: string;
  country?: string;
  language?: string;
  includeQuestions?: boolean;
  includeLongTail?: boolean;
}

// Updated to match your WordPress controller
export interface WordPressSiteConnection {
  name: string; // Required in your controller
  url: string;
  apiUrl: string; // Required in your controller
  username: string;
  applicationPassword: string;
}

// Updated to match your publish endpoint
export interface PublishToWordPressRequest {
  siteId?: string; // Optional override for different site
  publishDate?: string;
  status?: 'publish' | 'draft' | 'private';
}

export interface ErrorResponse {
  success: false;
  error: string;
  message?: string;
  errors?: Record<string, string[]>;
  statusCode?: number;
}