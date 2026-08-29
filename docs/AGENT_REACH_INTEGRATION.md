# Agent Reach 与指定指纹浏览器集成

Chrome Power 的 `/control` 接口是一个本机、只读优先的浏览器控制适配层。它把
`windowId` 映射到该窗口启动时保存的 CDP 端口，避免把原始 WebSocket 地址暴露给
渲染进程或外部客户端。

## 接口

```text
GET  http://127.0.0.1:<serverPort>/control/instances
GET  http://127.0.0.1:<serverPort>/control/instances/<windowId>/tabs
POST http://127.0.0.1:<serverPort>/control/instances/<windowId>/navigate
GET  http://127.0.0.1:<serverPort>/control/x/<windowId>/read?limit=20
POST http://127.0.0.1:<serverPort>/control/instances/<windowId>/disconnect
```

`navigate` 仅允许 `https://x.com`、`https://twitter.com` 及其 `www` 域名。
`read` 返回可见 X 推文的结构化快照，并提供 `loginLikely` 状态；登录必须由用户
在指定 profile 中手动完成。

仓库还提供了一个无依赖的命令行适配入口：

```bash
npm run control:x -- instances
npm run control:x -- read --window-id 77 --limit 20
npm run control:x -- navigate --window-id 77 --url https://x.com/home
```

这个命令适合被自定义 Agent Reach backend 或 MCP connector 调用。Agent Reach
本身不会自动发现该命令；需要在外部 connector 中把 `accountId/windowId` 映射到
上述命令，并把输出转换成 Agent Reach 使用的 JSON/YAML 结构。

项目现在还提供了一个本地 MCP stdio server：

```bash
npm run mcp:server
```

它暴露 `chrome_power_list_instances`、`chrome_power_list_tabs`、
`chrome_power_navigate`、`chrome_power_read_x` 和
`chrome_power_disconnect`。Codex 的 MCP 配置应把 command 指向项目目录下的
`npm run mcp:server`；如果 API 端口不是 49156，则设置
`CHROME_POWER_API_URL=http://127.0.0.1:<port>`。这个连接器仍然只提供导航、读取和
会话断开，不提供评论、点赞、发帖或自动登录。

## 与 Agent Reach 的边界

Agent Reach 的 Twitter 后端使用独立 Cookie 凭据或 OpenCLI 会话，并没有
`windowId/CDP port` 路由能力。因此不能仅通过配置 Agent Reach 把请求切换到本项目
的某个 profile。

融合时应增加一个外部 connector/backend：

```text
Agent Reach 的 X 读取意图
  -> connector 选择 accountId/windowId
  -> /control/x/<windowId>/read
  -> 归一化为 Agent Reach 的 JSON/YAML 输出
```

发帖、评论、点赞不属于 Agent Reach 的职责。若未来增加账号操作，必须单独实现
人工确认、推文 ID 去重、单账号串行锁、操作审计和异常页面停止机制；本接口当前
不会执行这些写操作。
