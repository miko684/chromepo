import knex from 'knex';
import {app} from 'electron';
import {mkdirSync, existsSync} from 'fs';
import {DB_CONFIG} from '../constants';
import {WindowDB} from './window';
import {reconcileWindowRuntimeState} from '../fingerprint';
import {join} from 'path';

// import {ProxyDB} from './proxy';
// import {GroupDB} from './group';
// import {TagDB} from './tag';

const db = knex(DB_CONFIG);

const initWindowStatus = async () => {
  await reconcileWindowRuntimeState();
};

const initializeDatabase = async () => {
  const userDataPath = app.getPath('userData');

  // 确保目录存在
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, {recursive: true});
  }

  try {
    // 初始化数据库连接
    await db.raw('SELECT 1');

    // 运行迁移
    await db.migrate.latest({
      directory: app.isPackaged ? join(process.resourcesPath, 'app/migrations') : './migrations',
    });

    // 初始化窗口状态
    await initWindowStatus();

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

export {db, initializeDatabase};
