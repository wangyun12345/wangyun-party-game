# 聚会桌游

一个无需注册、适合朋友聚会使用的多人桌游网页。玩家通过分享链接或房间码加入，房间状态由 Cloudflare Worker 的 Durable Object 保存，组织者手机断线不会让游戏暂停。

## 本地开发

在 `wangyun-party-game` 目录执行：

```text
npm install
npm run build
npm run typecheck:worker
npm test
npm run lint
```

`npm run dev` 会启动 Wrangler 本地 Worker。Windows 如果 `workerd` 报访问冲突，可继续使用 `npm run build`、`npm run typecheck:worker`、`npm test` 和 `npx wrangler deploy --dry-run` 完成静态验证，并在 Cloudflare 环境执行真实 smoke 流程。

## 部署

1. 安装并登录 Wrangler：`npx wrangler login`。
2. 在项目根目录执行 `npm run deploy`。
3. 将 Wrangler 输出的访问地址发给朋友；创建房间后使用页面上的分享链接或二维码。

不需要 Supabase、Vercel、数据库初始化脚本或账号系统。房间是临时的，空房超过运行时配置的闲置期限后会自动清理。

## 项目结构

- `src/worker.ts`：Worker 路由与 Durable Object WebSocket 入口。
- `src/room/engine.ts`：可测试的房间状态机、席位凭据、命令顺序和玩家视图投影。
- `party-game/src/lib/roomClient.ts`：浏览器端 HTTP/WebSocket 客户端与本地席位恢复。
- `party-game/src/games/`：游戏规则、投影和每款游戏的 React 视图。
- `test/`：房间、Worker API 和现有游戏规则测试。
