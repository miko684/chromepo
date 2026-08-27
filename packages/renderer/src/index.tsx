import React, {useEffect, useState} from 'react';
import 'virtual:windi.css';
import './index.css';
import {createRoot} from 'react-dom/client';
import App from './App';
import type {ThemeConfig} from 'antd';
import {ConfigProvider, message, theme as antdTheme} from 'antd';
import {HashRouter as Router} from 'react-router-dom';
import 'dayjs/locale/zh-cn';
// import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import './i18n';
import {useTranslation} from 'react-i18next';

const rootContainer = document.getElementById('app');
const initialUiTheme = (localStorage.getItem('chrome-power-ui-theme') as 'light' | 'dark' | 'system' | null) || 'light';
const initialDark = initialUiTheme === 'dark' || (initialUiTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme = initialDark ? 'dark' : 'light';

message.config({
  top: 1000,
  duration: 2,
});

const getTheme = (isDark: boolean): ThemeConfig => ({
  // token: {
  //   colorPrimary: '#4096ff',
  // },
  token: {
    motion: false,
  },
  components: {
    Layout: {
      bodyBg: isDark ? '#0f1720' : 'rgba(240, 242, 245, 0.25)',
      headerBg: isDark ? '#111a24' : 'transparent',
      siderBg: isDark ? '#111a24' : 'transparent',
      lightSiderBg: isDark ? '#111a24' : 'transparent',
      headerHeight: 48,
    },
    Menu: {
      itemBg: 'transparent',
      itemColor: isDark ? '#d8e2f0' : undefined,
      itemHoverColor: isDark ? '#ffffff' : undefined,
      itemSelectedColor: isDark ? '#8fc4ff' : undefined,
    },
  },
});

const root = createRoot(rootContainer!);
const LocalizedApp = () => {
  const {i18n} = useTranslation();
  const [uiTheme, setUiTheme] = useState<'light' | 'dark' | 'system'>(initialUiTheme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const onTheme = (event: Event) => setUiTheme((event as CustomEvent<'light' | 'dark' | 'system'>).detail || 'light');
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => setSystemDark(media.matches);
    window.addEventListener('chrome-power-theme-change', onTheme);
    media.addEventListener('change', onMedia);
    return () => { window.removeEventListener('chrome-power-theme-change', onTheme); media.removeEventListener('change', onMedia); };
  }, []);
  const isDark = uiTheme === 'dark' || (uiTheme === 'system' && systemDark);
  useEffect(() => { document.documentElement.dataset.theme = isDark ? 'dark' : 'light'; }, [isDark]);
  return (
    <ConfigProvider
      locale={i18n.language.startsWith('en') ? enUS : zhCN}
      theme={{...getTheme(isDark), algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm}}
    >
      <Router><App /></Router>
    </ConfigProvider>
  );
};

root.render(
  <React.StrictMode>
    <LocalizedApp />
  </React.StrictMode>,
);

