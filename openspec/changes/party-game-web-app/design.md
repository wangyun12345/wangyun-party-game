## 上下文

全新开发一个面向朋友聚会场景的移动端 Web 桌游平台。项目从零开始，无历史包袱。核心约束：**无服务器运维成本**、**无需安装 App**、**AI 辅助开发为主**（技术栈选型必须对 AI 代码生成极其友好）。

初始内置阿瓦隆与鹅鸭杀，架构需支持后续以插件形式扩展更多桌游。

## 目标 / 非目标

**目标：**
- 玩家通过手机浏览器打开链接，0 注册即可加入房间
- 同一房间内多个玩家的界面状态实时同步（延迟 < 500ms）
- 阿瓦隆和鹅鸭杀的完整游戏流程可以在手机上独立完成
- 架构层面支持以独立模块方式追加新桌游，不修改大厅核心代码
- 技术文档和代码结构对 AI 代码生成友好

**非目标：**
- 账号系统、历史战绩、排行榜（MVP 阶段不做）
- 服务器端游戏逻辑（所有裁判逻辑运行在房主浏览器）
- 原生 App / 微信小程序（Web 优先）
- 复杂动画或地图移动类操作（纯信息界面，不做 2D 地图）
- 防作弊 / 反外挂（聚会游戏，信任玩家）

## 决策

### D1：技术栈选型 — React + Vite + TailwindCSS + Supabase

**选择：** React（前端 UI） + Vite（构建工具） + TailwindCSS（样式） + Supabase（实时数据库 & BaaS）

**理由：**
- React 是 AI 代码生成（GPT、Claude 等）训练数据覆盖最广的前端框架，生成准确率最高
- Supabase 提供开箱即用的 Realtime 订阅，无需编写任何后端代码即可实现多客户端状态同步
- TailwindCSS 让 AI 直接在组件里写样式，不需要维护独立的 CSS 文件
- Vite 构建速度快，配置简单，对 AI 生成的代码几乎零配置可用

**替代方案：**
- Next.js：SSR 功能对本项目无用，反而增加复杂度，排除
- Vue + Nuxt：生态 AI 友好度略低于 React，排除
- Firebase：功能类似 Supabase，但 Supabase 开源且 SQL 模型更直观，优先选择

---

### D2：实时同步架构 — "房主即裁判"模式

**选择：** 游戏状态机逻辑运行在房主的浏览器 JavaScript 中，其余玩家的浏览器仅订阅 Supabase 中的游戏状态并提交动作。

```
┌──────────────────────────────────────────────────────────┐
│              数据流（房主即裁判模式）                     │
└──────────────────────────────────────────────────────────┘

 [玩家 B] ──(1. 提交动作)──▶ [Supabase: actions 表]
                                       │
                              (2. 房主监听动作)
                                       ▼
                           [房主浏览器: 游戏状态机]
                            - 验证动作合法性
                            - 推进游戏阶段
                            - 计算私有信息
                                       │
                     (3. 房主写入新游戏状态)
                                       ▼
                     [Supabase: room_state 表]
                                       │
                 (4. 所有玩家 Realtime 订阅收到推送)
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
                    [玩家 B 界面]              [玩家 C 界面]
                      自动刷新                   自动刷新
```

**理由：**
- 无需编写后端服务器，节省运维成本
- Supabase 免费套餐完全满足聚会场景（并发连接数 < 50）
- 游戏逻辑以 TypeScript 模块封装，可独立测试

**风险与缓解：** 见 Risk 章节

---

### D3：游戏插件接口设计

每个桌游必须实现以下统一接口，大厅层通过此接口与游戏交互：

```typescript
interface GamePlugin {
  // 元数据
  id: string;                          // e.g. "avalon"
  name: string;                        // e.g. "阿瓦隆"
  minPlayers: number;
  maxPlayers: number;

  // 生命周期钩子（均在房主浏览器执行）
  initGame(players: Player[]): GameState;           // 分配角色、初始化状态
  handleAction(state: GameState, action: Action): GameState; // 处理玩家动作
  getPhaseUI(state: GameState, viewerPlayerId: string): PhaseUI; // 每个角色视角的界面描述
  checkWinCondition(state: GameState): WinResult | null;
}
```

大厅层永远不感知具体游戏的规则，只负责：进出房间、传递玩家列表、调用 `initGame` 和 `handleAction`。

---

### D4：数据库表结构（Supabase）

```
rooms
  id (uuid, PK)
  code (6位数字, 唯一索引)        ← 玩家用此码加入房间
  host_player_id (uuid)
  game_id (text)                 ← e.g. "avalon"
  status (enum: waiting|playing|finished)
  game_state (jsonb)             ← 完整游戏状态（房主写，所有人读）
  created_at

players
  id (uuid, PK)
  room_id (uuid, FK)
  nickname (text)
  is_host (boolean)
  joined_at

actions
  id (uuid, PK)
  room_id (uuid, FK)
  player_id (uuid, FK)
  payload (jsonb)                ← 动作内容，如 {type: "vote", value: "success"}
  created_at
```

**信息隔离**：私有信息（如每个玩家的角色）存储在 `game_state.privateInfo[playerId]` 中，客户端只渲染自己的私有信息，其他玩家的私有字段在前端不展示（依赖 JavaScript 过滤，非数据库行级安全）。

> 注意：MVP 阶段不启用 Supabase Row Level Security，信息隔离由前端逻辑保证。若开放公网，后续需补充 RLS 策略。

---

### D5：私有信息隔离方案

鹅鸭杀和阿瓦隆中，玩家只能看到自己的身份/阵营，不能看到其他人的。在"无服务器"架构下，这通过以下约定实现：

- `game_state.publicInfo`：所有人都可看（当前阶段、投票进度、历史记录）
- `game_state.privateInfo`：一个以 playerId 为 key 的对象，每个客户端只渲染 `privateInfo[自己的playerId]`
- 风险：高手通过 DevTools 查看 JSON 可看到其他人角色 → MVP 聚会场景可接受，属于已知权衡

## 风险 / 权衡

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 房主刷新/掉线导致游戏暂停 | 中 | 检测到房主离线时，弹窗提示其他玩家等待或由第二个加入的玩家接管 host |
| Supabase 免费套餐并发限制（默认 200 连接） | 低 | 聚会场景玩家数 ≤ 20，远低于上限 |
| 手机浏览器后台被系统杀进程（尤其 iOS Safari） | 中 | 核心交互页面保持屏幕常亮提示，房主客户端需引导用户锁定屏幕前不要切后台 |
| 私有信息泄露（通过 DevTools 查看全量 JSON） | 低（聚会场景） | MVP 阶段接受；后续可通过 Supabase Edge Functions 做服务端信息过滤 |
| 阿瓦隆状态机复杂度超出预期 | 中 | 优先完成鹅鸭杀作为技术验证，再开发阿瓦隆 |

## 迁移计划

本项目为全新开发，无现有系统迁移问题。

部署方式：
1. 前端静态构建后部署至 Vercel 或 Cloudflare Pages（免费套餐）
2. Supabase 使用云托管免费套餐，初始化数据库表结构
3. 环境变量配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`

## 开放问题

1. **鹅鸭杀特殊角色范围**：MVP 是否只做鹅/鸭两种身份，还是要包含特殊角色（如商人、侦探等）？建议 MVP 先做基础两种。
2. **房间过期清理**：房间数据是否需要定时清理？Supabase 可配置 pg_cron，或 MVP 阶段手动清理。
3. **阿瓦隆角色配置**：玩家数量不同时，梅林/派西维尔/莫德雷德等可选角色如何配置？需要房主在开始游戏前有个角色配置界面。
