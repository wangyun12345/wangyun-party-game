## 1. 项目初始化与基础设施

- [x] 1.1 使用 Vite 创建 React + TypeScript 项目，配置 TailwindCSS
- [x] 1.2 创建 Supabase 项目，初始化 `rooms`、`players`、`actions` 三张数据库表
- [x] 1.3 配置 Supabase Row Level Security 策略（MVP：开放读写，后续收紧）
- [x] 1.4 配置环境变量（`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`）
- [x] 1.5 创建项目目录结构：`/src/games/`（游戏插件目录）、`/src/lobby/`、`/src/components/`
- [ ] 1.6 部署到 Vercel 或 Cloudflare Pages，确认公网可访问

## 2. 大厅核心功能（Lobby）

- [x] 2.1 实现首页：昵称输入框 + “创建房间”按钮 + “加入房间”（输入房间码）入口
- [x] 2.2 实现创建房间逻辑：生成6位房间码，写入 Supabase rooms 表，创建者写入 players 表并标记为 host
- [x] 2.3 实现加入房间逻辑：根据房间码查询房间，验证状态为 waiting，写入 players 表
- [x] 2.4 实现等待大厅界面：订阅 players 表 Realtime 变化，实时显示玩家列表
- [x] 2.5 实现游戏选择：房主可从已注册游戏列表中选择游戏，写入 rooms.game_id
- [x] 2.6 实现开始游戏逻辑：房主点击后验证最低人数，调用 `GamePlugin.initGame()`，将初始 game_state 写入 rooms 表
- [x] 2.7 大厅界面的错误提示：昵称格式校验、房间不存在、人数不足等边界情况

## 3. 实时同步层（Realtime Sync）

- [x] 3.1 封装 Supabase Realtime 订阅 hook：`useRoomState(roomId)` 监听 rooms.game_state 变化
- [x] 3.2 封装 Supabase Realtime 订阅 hook：`useActions(roomId)` 供房主监听新 actions
- [x] 3.3 实现玩家动作提交函数：`submitAction(roomId, playerId, payload)` 向 actions 表写入
- [x] 3.4 实现房主动作处理循环：监听 actions 表，依次调用 `GamePlugin.handleAction()`，写回 rooms.game_state
- [x] 3.5 实现连接状态检测：Realtime 断开时显示“连接已断开”提示条，重连成功后自动消失
- [x] 3.6 实现房主离线检测：通过 Supabase Presence 心跳检测，非房主玩家感知房主断线并展示提示

## 4. 游戏插件接口（Game Plugin Interface）

- [x] 4.1 定义 `GamePlugin` TypeScript 接口：`initGame`、`handleAction`、`getPhaseUI`、`checkWinCondition`
- [x] 4.2 定义共用类型：`Player`、`GameState`、`Action`、`PhaseUI`、`WinResult`
- [x] 4.3 创建游戏注册表 `GameRegistry`：支持 `register(plugin: GamePlugin)` 和 `getAll()` 方法
- [x] 4.4 实现通用游戏容器组件 `GameContainer`：根据 `rooms.game_id` 动态加载对应游戏的 UI，调用 `getPhaseUI()` 渲染界面

## 5. 鹅鸭杀游戏引擎（Goose Goose Duck）

- [x] 5.1 实现 `GooseDuckPlugin` 的 `initGame()`：随机分配鹅/鸭身份，生成初始 game_state（含 publicInfo 和 privateInfo）
- [x] 5.2 实现 `GooseDuckPlugin` 的 `getPhaseUI()`：根据 viewerPlayerId 返回其角色、存活状态、鸭子同伴列表（仅对鸭子可见）
- [x] 5.3 实现紧急会议触发：`handleAction({type: "call_meeting", ...})` 将阶段切换为 discussion
- [x] 5.4 实现讨论阶段倒计时（默认60秒）：倒计时归零后自动切换到投票阶段
- [x] 5.5 实现投票逻辑：`handleAction({type: "vote", targetId: ...})` 收集所有存活玩家投票，全部投完后结算
- [x] 5.6 实现投票结算：最多票数玩家被驱逐（平票无人被驱逐），更新 publicInfo，调用 `checkWinCondition()`
- [x] 5.7 实现 `GooseDuckPlugin` 的 `checkWinCondition()`：鸭子数 ≥ 鹅数 → 鸭子胜；鸭子数为0 → 鹅胜
- [x] 5.8 实现游戏结束界面：展示胜负结果及所有玩家身份揭示
- [x] 5.9 注册 GooseDuckPlugin 到 GameRegistry

## 6. 阿瓦隆游戏引擎（Avalon）

- [x] 6.1 实现阿瓦隆角色配置界面：房主可根据人数勾选可选角色（梅林、派西维尔、莫德雷德等）
- [x] 6.2 实现 `AvalonPlugin` 的 `initGame()`：根据配置随机分配角色，生成各玩家可见信息（privateInfo）
- [x] 6.3 实现 `AvalonPlugin` 的 `getPhaseUI()`：根据角色返回对应可见信息（梅林看坏人、奥伯伦对梅林不可见等）
- [x] 6.4 实现领袖提名阶段：领袖选择指定人数队员，`handleAction({type: "nominate", members: [...]})`
- [x] 6.5 实现组队投票阶段：所有玩家投赞成/反对，全部投完后公示并结算
- [x] 6.6 实现连续5次提名失败时邪恶方胜利逻辑
- [x] 6.7 实现任务执行阶段：被选中队员投成功/失败（正义方只能投成功），全部投完后结算
- [x] 6.8 实现任务轮次跟踪：记录每轮任务胜负，累计正义/邪恶各自的分数
- [x] 6.9 实现刺杀阶段：正义方赢满3轮后，刺客选择一名玩家进行刺杀
- [x] 6.10 实现 `AvalonPlugin` 的 `checkWinCondition()`：三种终局逻辑（邪恶赢3轮/提名5次失败/刺杀成功翻盘）
- [x] 6.11 实现游戏结束界面：展示胜负结果及所有角色揭示
- [x] 6.12 注册 AvalonPlugin 到 GameRegistry

## 7. 游戏结束与复局

- [x] 7.1 实现“再来一局”功能：房主点击后重置 rooms.game_state，重新调用 `initGame()` 并保留玩家列表
- [x] 7.2 实现“返回大厅”功能：将 rooms.status 设为 waiting，所有玩家跳转回等待界面，可重新选游戏

## 8. 移动端适配与体验优化

- [x] 8.1 确认所有界面在 375px ~ 430px 宽度手机屏幕上布局正常，无横向滚动
- [x] 8.2 添加屏幕常亮提示（尤其针对房主），防止系统休眠导致游戏暂停
- [x] 8.3 优化触控交互：按钮尺寸不小于 44x44px，重要操作有触觉反馈或视觉反馈
- [x] 8.4 测试微信内置浏览器兼容性（iOS + Android），测试 Safari 和 Chrome
