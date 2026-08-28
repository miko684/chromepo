import {app, BrowserWindow, ipcMain, dialog, shell} from 'electron';
import {createLogger} from '../../../shared/utils/logger';
import {CONFIG_FILE_PATH, LOGS_PATH, SERVICE_LOGGER_LABEL} from '../constants';
import {join} from 'path';
import {copyFileSync, writeFileSync, readFileSync} from 'fs';
import type {SettingOptions} from '../../../shared/types/common';
import {getSettings} from '../utils/get-settings';
import {getOrigin} from '../server';
import axios from 'axios';
import {mkdir, readdir, writeFile} from 'fs/promises';
import type {LogModule} from '../../../shared/types/common';


const logger = createLogger(SERVICE_LOGGER_LABEL);

export const initCommonService = () => {
  ipcMain.handle('common-download', async (_, filePath: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    const defaultPath = join(app.getPath('downloads'), 'template.xlsx');

    const {filePath: savePath} = await dialog.showSaveDialog(win, {
      title: 'Save Template',
      defaultPath: defaultPath,
      buttonLabel: 'Save',
    });

    if (savePath) {
      copyFileSync(join(__dirname, '../..', filePath), savePath);

      // 打开文件管理器并选择该文件
      shell.showItemInFolder(savePath);

      return savePath;
    } else {
      return null;
    }
  });

  // 添加 IPC 处理程序
  ipcMain.handle('common-save-dialog', async (_, options) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return {canceled: true};
    return dialog.showSaveDialog(win, options);
  });

  ipcMain.handle('common-save-file', async (_, {filePath, buffer}) => {
    await writeFile(filePath, buffer);
  });

  ipcMain.handle('common-fetch-settings', async () => {
    const settings = getSettings();

    return settings;
  });

  ipcMain.handle(
    'common-fetch-logs',
    async (_, module: LogModule = 'Main') => {
      const normalizedModule = (() => {
        switch (module) {
          case 'Windows':
            return 'Window';
          case 'Services':
            return 'Service';
          case 'Main':
          case 'Window':
          case 'Proxy':
          case 'Service':
          case 'Api':
            return module;
          default:
            return 'Main';
        }
      })();
      const logDir = join(LOGS_PATH, normalizedModule);

      try {
        await mkdir(logDir, {recursive: true});
        const entries = await readdir(logDir, {withFileTypes: true});
        const logFiles = entries
          .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.log'))
          .sort((left, right) => left.name.localeCompare(right.name))
          .slice(-10);

        return logFiles.map(entry => {
          const logFile = join(logDir, entry.name);
          const content = readFileSync(logFile, 'utf8');
          const formatContent = content
            .split('\n')
            .map(line => {
              const match = line.match(/-\s*(info|warn|error):/i);
              return {
                message: line,
                level: match?.[1]?.toLowerCase() || 'info',
              };
            })
            .filter(line => line.message);
          return {name: entry.name, content: formatContent};
        });
      } catch (error) {
        logger.error('Error reading logs:', error);
        return [];
      }
    },
  );

  ipcMain.handle('common-save-settings', async (_, values: SettingOptions) => {
    if (values.localChromePath === '/Applications/Google Chrome.app') {
      values.localChromePath = values.localChromePath + '/Contents/MacOS/Google Chrome';
    }
    const configFilePath = CONFIG_FILE_PATH;

    try {
      writeFileSync(configFilePath, JSON.stringify(values), 'utf8');
    } catch (error) {
      logger.error('Error writing to the settings file:', error);
    }

    return {};
  });

  ipcMain.handle(
    'common-choose-path',
    async (_, type: 'openFile' | 'openDirectory' = 'openDirectory') => {
      // const win = BrowserWindow.getAllWindows()[0];

      const path = await dialog.showOpenDialog({properties: [type]});

      return path.filePaths[0];
    },
  );

  ipcMain.handle('common-api', async () => {
    const apiUrl = getOrigin();
    const res = await axios.get(`${apiUrl}/status`);
    return {
      url: apiUrl,
      ...(res?.data || {}),
    };
  });
};
