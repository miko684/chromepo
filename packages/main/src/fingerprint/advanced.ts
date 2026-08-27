import type {Browser, Page} from 'puppeteer';
import type {DB} from '../../../shared/types/db';

type IPInfo = {timeZone?: string; ip?: string; country?: string; ll?: number[]};

const WINDOWS_FONTS = ['Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Microsoft YaHei', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana'];

export const normalizeFingerprint = (raw?: DB.FingerprintConfig | null): DB.FingerprintConfig => {
  const input = raw || {};
  const seed = Number.isFinite(Number(input.seed)) ? Number(input.seed) : Math.floor(Math.random() * 2 ** 31);
  return {
    templateId: input.templateId || 'windows-intel-mainstream',
    snapshotVersion: input.snapshotVersion || 1,
    generatedAt: input.generatedAt || new Date().toISOString(),
    seed,
    ua: input.ua || '',
    platform: input.platform || 'Win32',
    platformVersion: input.platformVersion || '10.0.0',
    architecture: input.architecture || 'x86',
    bitness: input.bitness || '64',
    languageMode: input.languageMode || 'ip',
    language: input.language || 'zh-CN',
    timezoneMode: input.timezoneMode || 'ip',
    customTimezone: input.customTimezone || '',
    locationMode: input.locationMode || 'ip',
    webRTCMode: input.webRTCMode || 'proxy',
    doNotTrack: input.doNotTrack || 'unspecified',
    canvasMode: input.canvasMode || 'noise',
    webGLMode: input.webGLMode || 'noise',
    webGLVendor: input.webGLVendor || 'Google Inc. (NVIDIA)',
    webGLRenderer: input.webGLRenderer || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
    audioMode: input.audioMode || 'noise',
    clientRectsMode: input.clientRectsMode || 'noise',
    hardwareConcurrency: input.hardwareConcurrency || 8,
    deviceMemory: input.deviceMemory || 8,
    webGPUMode: input.webGPUMode || 'custom',
    webGPUVendor: input.webGPUVendor || 'nvidia',
    webGPUArchitecture: input.webGPUArchitecture || 'ampere',
    webGPUDevice: input.webGPUDevice || 'GeForce RTX 3060',
    fontTemplate: input.fontTemplate || 'windows-standard',
    fonts: input.fonts?.length ? input.fonts : WINDOWS_FONTS,
    cameraCount: input.cameraCount ?? 1,
    microphoneCount: input.microphoneCount ?? 1,
    speakerCount: input.speakerCount ?? 1,
    notificationPermission: input.notificationPermission || 'prompt',
    geolocationPermission: input.geolocationPermission || 'prompt',
    cameraPermission: input.cameraPermission || 'prompt',
    microphonePermission: input.microphonePermission || 'prompt',
    devicePixelRatio: input.devicePixelRatio || 1,
    colorDepth: input.colorDepth || 24,
    pixelDepth: input.pixelDepth || 24,
    maxTouchPoints: input.maxTouchPoints ?? 0,
    prefersColorScheme: input.prefersColorScheme || 'light',
    speechVoices: input.speechVoices || [],
  };
};

const stableNoise = (seed: number, value: number) => {
  const x = Math.sin(seed * 12.9898 + value * 78.233) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.00001;
};

export const buildFingerprintScript = (config: DB.FingerprintConfig) => {
  const c = normalizeFingerprint(config);
  const payload = JSON.stringify({
    ...c,
    fonts: c.fonts || WINDOWS_FONTS,
    noise: c.seed || 1,
  });
  return `(() => {
    const c = ${payload};
    const define = (obj, key, value) => { try { Object.defineProperty(obj, key, {get: () => value, configurable: true}); } catch {} };
    const nav = navigator;
    const ua = c.ua || nav.userAgent;
    define(Navigator.prototype, 'userAgent', ua);
    define(Navigator.prototype, 'platform', c.platform || 'Win32');
    define(Navigator.prototype, 'language', c.language || 'zh-CN');
    define(Navigator.prototype, 'languages', Object.freeze([c.language || 'zh-CN', 'en-US', 'en']));
    define(Navigator.prototype, 'hardwareConcurrency', Number(c.hardwareConcurrency) || 8);
    define(Navigator.prototype, 'deviceMemory', Number(c.deviceMemory) || 8);
    define(Navigator.prototype, 'maxTouchPoints', Number(c.maxTouchPoints) || 0);
    if (c.doNotTrack !== 'unspecified') define(Navigator.prototype, 'doNotTrack', c.doNotTrack);
    const brands = [{brand: 'Not)A;Brand', version: '99'}, {brand: 'Chromium', version: (ua.match(/Chrome\\/(\\d+)/) || [0, '126'])[1]}, {brand: 'Google Chrome', version: (ua.match(/Chrome\\/(\\d+)/) || [0, '126'])[1]}];
    const uaData = {brands, mobile: false, platform: 'Windows', platformVersion: c.platformVersion || '10.0.0', architecture: c.architecture || 'x86', bitness: c.bitness || '64', model: '', getHighEntropyValues: async (h) => Object.fromEntries(h.map(k => [k, ({architecture: uaData.architecture, bitness: uaData.bitness, model: uaData.model, platform: uaData.platform, platformVersion: uaData.platformVersion, uaFullVersion: (ua.match(/Chrome\\/([\\d.]+)/) || [0, '126.0.0.0'])[1]})[k] ?? '']))};
    define(Navigator.prototype, 'userAgentData', uaData);
    const scr = Screen.prototype;
    const res = String(c.screenResolution || '1920x1080').split('x').map(Number);
    const sw = res[0] || 1920, sh = res[1] || 1080;
    [['width', sw], ['height', sh], ['availWidth', sw], ['availHeight', sh - 40], ['colorDepth', c.colorDepth || 24], ['pixelDepth', c.pixelDepth || c.colorDepth || 24]].forEach(([k,v]) => define(scr, k, v));
    define(window, 'devicePixelRatio', Number(c.devicePixelRatio) || 1);
    try { Object.defineProperty(window, 'outerWidth', {get: () => innerWidth, configurable: true}); Object.defineProperty(window, 'outerHeight', {get: () => innerHeight + 88, configurable: true}); } catch {}
    const oldMatch = window.matchMedia.bind(window); window.matchMedia = q => { if (/prefers-color-scheme/.test(q)) return {matches: c.prefersColorScheme === 'dark', media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){return false}}; return oldMatch(q); };
    if (c.locationMode === 'ip' && ${JSON.stringify(true)}) {
      const lat = ${JSON.stringify(0)}, lon = ${JSON.stringify(0)};
      if (lat || lon) navigator.geolocation.getCurrentPosition = (ok) => ok({coords:{latitude:lat, longitude:lon, accuracy:100}, timestamp:Date.now()});
    }
    if (c.webRTCMode === 'disabled') { try { window.RTCPeerConnection = undefined; window.webkitRTCPeerConnection = undefined; } catch {} }
    if (c.canvasMode === 'noise') { const oc = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = function(...a){ const ctx=this.getContext('2d'); if(ctx){try{const d=ctx.getImageData(0,0,this.width,this.height); for(let i=0;i<d.data.length;i+=4){d.data[i]=Math.max(0,Math.min(255,d.data[i]+(Math.sin(c.noise+i)*0.5)));} ctx.putImageData(d,0,0);}catch{}} return oc.apply(this,a); }; }
    if (c.webGLMode !== 'real') { const gp=WebGLRenderingContext.prototype.getParameter; WebGLRenderingContext.prototype.getParameter=function(p){if(p===37445)return c.webGLVendor;if(p===37446)return c.webGLRenderer;return gp.call(this,p);}; if(window.WebGL2RenderingContext){const gp2=WebGL2RenderingContext.prototype.getParameter;WebGL2RenderingContext.prototype.getParameter=function(p){if(p===37445)return c.webGLVendor;if(p===37446)return c.webGLRenderer;return gp2.call(this,p);};} }
    if (c.webGPUMode === 'disabled') { try { Object.defineProperty(Navigator.prototype, 'gpu', {get: () => undefined, configurable: true}); } catch {} } else if (c.webGPUMode === 'custom') { try { Object.defineProperty(Navigator.prototype, 'gpu', {get: () => ({requestAdapter: async () => ({name:c.webGPUDevice, vendor:c.webGPUVendor, architecture:c.webGPUArchitecture, features:new Set(), limits:{}})}), configurable: true}); } catch {} }
    const allowed = new Set(c.fonts || []); if (document.fonts?.check) { const fc=document.fonts.check.bind(document.fonts); document.fonts.check=(font, text)=>allowed.has(String(font).replace(/^[^ ]+ /,'')) || fc(font,text); }
    if (navigator.mediaDevices?.enumerateDevices) { navigator.mediaDevices.enumerateDevices = async () => { const out=[]; for(let i=0;i<(c.cameraCount||0);i++)out.push({kind:'videoinput',deviceId:'orbit-cam-'+i,groupId:'orbit-group-'+i,label:''}); for(let i=0;i<(c.microphoneCount||0);i++)out.push({kind:'audioinput',deviceId:'orbit-mic-'+i,groupId:'orbit-group-'+i,label:''}); for(let i=0;i<(c.speakerCount||0);i++)out.push({kind:'audiooutput',deviceId:'orbit-spk-'+i,groupId:'orbit-group-'+i,label:''}); return out; }; }
    try { Object.defineProperty(Notification, 'permission', {get: () => c.notificationPermission || 'prompt', configurable: true}); } catch {}
    if (navigator.permissions?.query) { const oq=navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = d => { const m={notifications:c.notificationPermission,geolocation:c.geolocationPermission,camera:c.cameraPermission,microphone:c.microphonePermission}; if(m[d.name]) return Promise.resolve({state:m[d.name], onchange:null}); return oq(d); }; }
    if (c.speechVoices?.length && window.speechSynthesis) speechSynthesis.getVoices=()=>c.speechVoices.map((name,i)=>({name,lang:i?'en-US':'zh-CN',localService:true,default:i===0}));
  })();`;
};

export async function applyFingerprintToPage(page: Page, browser: Browser, config: DB.FingerprintConfig, ipInfo: IPInfo = {}) {
  const normalized = normalizeFingerprint(config);
  const ua = normalized.ua || (await browser.userAgent().catch(() => ''));
  const language = normalized.language || 'zh-CN';
  const session = await page.target().createCDPSession();
  await session.send('Network.enable');
  await session.send('Network.setUserAgentOverride', {
    userAgent: ua,
    acceptLanguage: `${language},en-US;q=0.9,en;q=0.8`,
    platform: 'Windows',
    userAgentMetadata: {
      brands: [{brand: 'Not)A;Brand', version: '99'}, {brand: 'Chromium', version: (ua.match(/Chrome[^0-9]*([0-9]+)/) || [0, '126'])[1]}],
      fullVersion: (ua.match(/Chrome[^0-9]*([0-9.]+)/) || [0, '126.0.0.0'])[1], mobile: false, platform: 'Windows', platformVersion: normalized.platformVersion || '10.0.0', architecture: normalized.architecture || 'x86', bitness: normalized.bitness || '64', model: '',
    },
  });
  const script = buildFingerprintScript(normalized);
  await page.evaluateOnNewDocument(script);
  await page.evaluate(script).catch(() => undefined);
  const timezone = normalized.timezoneMode === 'custom' ? normalized.customTimezone : ipInfo.timeZone;
  if (timezone) await session.send('Emulation.setTimezoneOverride', {timezoneId: timezone}).catch(() => undefined);
  await page.setExtraHTTPHeaders({'Accept-Language': `${language},en-US;q=0.9,en;q=0.8`}).catch(() => undefined);
}

export async function collectFingerprintHealthReport(page: Page, config: DB.FingerprintConfig, ipInfo: IPInfo = {}): Promise<DB.FingerprintHealthReport> {
  const expected = normalizeFingerprint(config);
  const actual = await page.evaluate(() => ({ua:navigator.userAgent, platform:navigator.platform, language:navigator.language, languages:navigator.languages, cores:navigator.hardwareConcurrency, memory:(navigator as any).deviceMemory, dpr:devicePixelRatio, colorDepth:screen.colorDepth, maxTouchPoints:navigator.maxTouchPoints, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})).catch(() => ({} as any));
  const items: DB.FingerprintHealthCheck[] = [];
  const check = (key: string, label: string, ok: boolean, value: unknown) => items.push({key, label, status: ok ? 'pass' : 'warning', expected: String(value ?? ''), actual: String((actual as any)[key] ?? '')});
  check('platform', '平台与模板', actual.platform === expected.platform, expected.platform);
  check('language', '语言与模板', !expected.language || actual.language === expected.language, expected.language);
  check('cores', 'CPU 核心数', !expected.hardwareConcurrency || actual.cores === expected.hardwareConcurrency, expected.hardwareConcurrency);
  check('memory', '设备内存', !expected.deviceMemory || actual.memory === expected.deviceMemory, expected.deviceMemory);
  check('dpr', 'DPR', !expected.devicePixelRatio || actual.dpr === expected.devicePixelRatio, expected.devicePixelRatio);
  check('colorDepth', '色深', !expected.colorDepth || actual.colorDepth === expected.colorDepth, expected.colorDepth);
  const failed = items.filter(i => i.status === 'fail').length;
  const warnings = items.filter(i => i.status === 'warning').length;
  return {status: failed ? 'error' : warnings ? 'warning' : 'healthy', score: Math.max(0, Math.round(100 - warnings * 8 - failed * 25)), checkedAt: new Date().toISOString(), templateId: expected.templateId, proxyIp: ipInfo.ip, browserVersion: (actual.ua || '').match(/Chrome[^0-9]*([0-9.]+)/)?.[1], items};
}
