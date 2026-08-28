import axios from 'axios';
import puppeteer, {type Browser, type Page} from 'puppeteer';
import {Mutex} from 'async-mutex';
import {WindowDB} from '../db/window';
import {openFingerprintWindow} from '../fingerprint';
import type {
  BrowserInstanceSummary,
  BrowserTabSummary,
  XPageSnapshot,
  XTweetSnapshot,
} from '../../../shared/types/control';

interface BrowserSession {
  browser: Browser;
  mutex: Mutex;
  connectedAt: number;
}

interface BrowserVersionInfo {
  webSocketDebuggerUrl?: string;
}

const sessions = new Map<number, BrowserSession>();
const locks = new Map<number, Mutex>();
const X_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);

const getWindowLock = (windowId: number) => {
  let lock = locks.get(windowId);
  if (!lock) {
    lock = new Mutex();
    locks.set(windowId, lock);
  }
  return lock;
};

const getBrowserVersion = async (port: number): Promise<BrowserVersionInfo> => {
  const response = await axios.get<BrowserVersionInfo>(`http://127.0.0.1:${port}/json/version`, {
    timeout: 1500,
  });
  return response.data;
};

const isXPage = (url: string) => {
  try {
    return X_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
};

const getOrConnectBrowser = async (windowId: number): Promise<Browser> => {
  const current = sessions.get(windowId);
  if (current?.browser.connected) return current.browser;

  let windowData = await WindowDB.getById(windowId);
  if (!windowData || windowData.status === 0) {
    throw new Error(`Browser instance ${windowId} does not exist.`);
  }

  if (!windowData.port || windowData.status !== 2) {
    await openFingerprintWindow(windowId, false);
    windowData = await WindowDB.getById(windowId);
  }

  if (!windowData?.port) {
    throw new Error(`Browser instance ${windowId} has no active CDP port.`);
  }

  const version = await getBrowserVersion(windowData.port);
  if (!version.webSocketDebuggerUrl) {
    throw new Error(`Browser instance ${windowId} did not expose a CDP endpoint.`);
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: version.webSocketDebuggerUrl,
    defaultViewport: null,
  });
  const session: BrowserSession = {
    browser,
    mutex: getWindowLock(windowId),
    connectedAt: Date.now(),
  };
  sessions.set(windowId, session);
  browser.once('disconnected', () => {
    if (sessions.get(windowId)?.browser === browser) sessions.delete(windowId);
  });
  return browser;
};

const withBrowser = async <T>(windowId: number, callback: (browser: Browser) => Promise<T>) => {
  const lock = getWindowLock(windowId);
  const release = await lock.acquire();
  try {
    return await callback(await getOrConnectBrowser(windowId));
  } finally {
    release();
  }
};

const getPageSummary = async (page: Page): Promise<BrowserTabSummary> => ({
  targetId: (page.target() as unknown as {_targetId?: string})._targetId || page.url(),
  url: page.url(),
  title: await page.title().catch(() => ''),
  isXPage: isXPage(page.url()),
});

const getXPage = async (browser: Browser, navigate = false): Promise<Page> => {
  const pages = await browser.pages();
  const existing = pages.find(page => isXPage(page.url()));
  if (existing) return existing;
  if (!navigate) throw new Error('No X page is open in this browser instance.');

  const page = await browser.newPage();
  await page.goto('https://x.com/home', {waitUntil: 'domcontentloaded', timeout: 30000});
  return page;
};

export const listBrowserInstances = async (): Promise<BrowserInstanceSummary[]> => {
  const windows = await WindowDB.all();
  return await Promise.all(windows.map(async windowData => {
    const windowId = Number(windowData.id);
    const connected = sessions.get(windowId)?.browser.connected === true;
    let cdpReady = false;
    if (windowData.port) {
      try {
        const version = await getBrowserVersion(windowData.port);
        cdpReady = Boolean(version.webSocketDebuggerUrl);
      } catch {
        cdpReady = false;
      }
    }

    return {
      windowId,
      profileId: windowData.profile_id,
      name: windowData.name,
      pid: windowData.pid,
      port: windowData.port,
      status: cdpReady ? 'running' : windowData.status === 1 ? 'closed' : 'unavailable',
      cdpReady,
      connected,
    };
  }));
};

export const listBrowserTabs = async (windowId: number) =>
  await withBrowser(windowId, async browser => {
    const pages = await browser.pages();
    return await Promise.all(pages.map(getPageSummary));
  });

export const navigateBrowserInstance = async (windowId: number, rawUrl: string) => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('A valid URL is required.');
  }
  if (!X_HOSTS.has(url.hostname.toLowerCase()) || url.protocol !== 'https:') {
    throw new Error('This connector only navigates X URLs.');
  }

  return await withBrowser(windowId, async browser => {
    const page = await getXPage(browser, true);
    await page.goto(url.toString(), {waitUntil: 'domcontentloaded', timeout: 30000});
    return await getPageSummary(page);
  });
};

export const readXPage = async (windowId: number, limit = 20): Promise<XPageSnapshot> => {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 20, 1), 50);
  return await withBrowser(windowId, async browser => {
    const page = await getXPage(browser, true);
    const tweets = await page.evaluate((maxTweets): XTweetSnapshot[] => {
      const seen = new Set<string>();
      const results: XTweetSnapshot[] = [];
      for (const article of Array.from(document.querySelectorAll('article'))) {
        const link = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'))
          .find(candidate => /\/status\/\d+/.test(candidate.href));
        const match = link?.href.match(/\/status\/(\d+)/);
        const text = (article.textContent || '').replace(/\s+/g, ' ').trim();
        if (!match || !text || seen.has(match[1])) continue;
        seen.add(match[1]);
        results.push({tweetId: match[1], url: link?.href || '', text});
        if (results.length >= maxTweets) break;
      }
      return results;
    }, safeLimit);
    const bodyText = await page.evaluate(() => document.body?.innerText || '');
    const url = page.url();
    const loginLikely = /\/i\/flow\/login|\/login/i.test(url) ||
      (/\blog in\b/i.test(bodyText) && tweets.length === 0);
    return {
      windowId,
      url,
      title: await page.title().catch(() => ''),
      loginLikely,
      tweets,
    };
  });
};

export const disconnectBrowserSession = async (windowId: number) => {
  const session = sessions.get(windowId);
  if (!session) return;
  sessions.delete(windowId);
  await session.browser.disconnect();
};
