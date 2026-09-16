# 聚会桌游

一个无需注册、适合朋友聚会使用的多人桌游网页。玩家通过分享链接或房间码加入，房间状态由 Vercel Functions 和 Upstash Redis 保存，组织者手机断线不会让游戏暂停。

## 本地开发

在 `wangyun-party-game` 目录执行：

```text
npm install
npm run build
npm run typecheck:server
npm test
npm run lint
```

`npm run dev` 会启动 Vercel 本地开发服务。首次使用需要在 Vercel 项目中绑定 Upstash Redis，并提供 `UPSTASH_REDIS_REST_URL` 与 `UPSTASH_REDIS_REST_TOKEN`；兼容旧的 `KV_REST_API_URL` 与 `KV_REST_API_TOKEN` 命名。

## 部署

1. 在 Vercel Marketplace 安装 Upstash Redis，确认 Production 环境变量已注入。
2. 将 Git 仓库连接到 Vercel，或使用 Vercel CLI：`npx vercel login` 后执行 `npm run deploy`。
3. 将 Vercel 输出的访问地址发给朋友；创建房间后使用页面上的分享链接或二维码。

不需要 Supabase、Cloudflare、数据库初始化脚本或账号系统。房间是临时的，空房超过运行时配置的闲置期限后会自动清理。

## 项目结构

- `api/`：Vercel Functions 的健康检查、创建/加入/离开、快照和命令接口。
- `src/room/engine.ts`：可测试的房间状态机、席位凭据、命令顺序和玩家视图投影。
- `src/room/redis.ts`：Upstash Redis 房间存储和跨函数实例命令锁。
- `party-game/src/lib/roomClient.ts`：浏览器端 HTTP 客户端、状态轮询与本地席位恢复。
- `party-game/src/games/`：游戏规则、投影和每款游戏的 React 视图。
- `test/`：房间、Worker API 和现有游戏规则测试。
