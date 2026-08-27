export interface OperationResult {
  success: boolean;
  message: string;
  data?: SafeAny;
}

export interface SettingOptions {
  uiLanguage?: 'zh' | 'en';
  uiTheme?: 'light' | 'dark' | 'system';
  strictProxyMode?: boolean;
  profileCachePath: string;
  useLocalChrome: boolean;
  localChromePath: string;
  chromiumBinPath: string;
  automationConnect: boolean;
  licenseServerUrl?: string;
  licenseEnforced?: boolean;
}

export type NoticeType = 'info' | 'success' | 'error' | 'warning' | 'loading';

export interface BridgeMessage {
  type: NoticeType;
  text: string;
}
