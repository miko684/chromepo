export type BrowserControlStatus = 'closed' | 'running' | 'unavailable';

export interface BrowserInstanceSummary {
  windowId: number;
  profileId?: string;
  name?: string;
  pid?: number | null;
  port?: number | null;
  status: BrowserControlStatus;
  cdpReady: boolean;
  connected: boolean;
}

export interface BrowserTabSummary {
  targetId: string;
  url: string;
  title: string;
  isXPage: boolean;
}

export interface XTweetSnapshot {
  tweetId: string;
  url: string;
  text: string;
}

export interface XPageSnapshot {
  windowId: number;
  url: string;
  title: string;
  loginLikely: boolean;
  tweets: XTweetSnapshot[];
}

export interface BrowserControlResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}
