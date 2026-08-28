import express from 'express';
import {
  disconnectBrowserSession,
  listBrowserInstances,
  listBrowserTabs,
  navigateBrowserInstance,
  readXPage,
} from '../../services/browser-control-service';

const router = express.Router();

const parseWindowId = (value: string) => {
  const windowId = Number(value);
  if (!Number.isInteger(windowId) || windowId <= 0) throw new Error('windowId must be a positive integer.');
  return windowId;
};

const handle = (handler: express.RequestHandler): express.RequestHandler => async (req, res) => {
  try {
    await handler(req, res, () => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Browser control request failed.';
    res.status(400).json({success: false, message});
  }
};

router.get('/instances', handle(async (_req, res) => {
  res.json({success: true, data: await listBrowserInstances()});
}));

router.get('/instances/:windowId/tabs', handle(async (req, res) => {
  res.json({success: true, data: await listBrowserTabs(parseWindowId(req.params.windowId))});
}));

router.post('/instances/:windowId/navigate', handle(async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  res.json({success: true, data: await navigateBrowserInstance(parseWindowId(req.params.windowId), url)});
}));

router.get('/x/:windowId/read', handle(async (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  res.json({success: true, data: await readXPage(parseWindowId(req.params.windowId), limit)});
}));

router.post('/instances/:windowId/disconnect', handle(async (req, res) => {
  await disconnectBrowserSession(parseWindowId(req.params.windowId));
  res.json({success: true});
}));

export default router;
