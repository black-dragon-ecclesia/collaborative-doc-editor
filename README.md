# 在线协同文档编辑器

基于 Vue3 + Node.js 的在线协同文档系统，支持多用户实时协同编辑、文档分享、版本快照回滚。采用 **差分操作（Operation）+ 简易 OT 变换** 解决并发编辑冲突，不用 WebSocket 全量覆盖。

## 功能特性

- **账号体系**：注册 / 登录，密码 bcrypt 加密，JWT 鉴权
- **目录管理**：文件夹与文档的层级管理（新建、重命名、删除）
- **文档编辑**：Monaco Editor 编辑器，1.2s 防抖自动保存
- **本地草稿**：编辑中内容自动备份到 localStorage，刷新后可恢复
- **实时协同**：Socket.io 房间机制，多端同步编辑，在线成员列表
- **并发冲突**：差分操作 `{pos, del, ins}` + OT transform，避免互相覆盖
- **文档分享**：生成分享链接，支持只读 / 可编辑两种权限，可设过期时间
- **版本快照**：手动保存版本、查看历史列表、预览、一键回滚（回滚同样走协同广播）
- **按后缀切换视图**：文件名后缀决定文档类型（纯文本 / Markdown / 代码 / CSV 表格），不做手动切换
- **CSV 表格视图**：粘贴即建表，三规则校验（分隔符数量一致、引号闭合、至少两列），支持改单元格、加行、删行，本端可与文本视图互转
- **编辑统计**：`doc_edit_log` 埋点，ECharts 折线 / 柱状 / 饼图展示一段时间内的插入与删除趋势
- **共享批注画布**：Canvas 覆盖层，房间内多人实时共享笔画，批注时锁正文编辑并提示他人；只读访客同样可批注

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3（`<script setup>`）、Vite、Vue Router、Pinia、Element Plus、Monaco Editor、axios、socket.io-client、papaparse（CSV 解析）、marked（Markdown 渲染）、echarts（统计图表） |
| 后端 | Node.js + Express 5、JWT（jsonwebtoken）、bcryptjs、mysql2、socket.io |
| 数据库 | MySQL 8（`collab_doc_db`，utf8mb4） |
| 协议 | HTTP REST + WebSocket（Socket.io） |

## 目录结构

```
collaborative-doc-editor/
├── backend/
│   ├── app.js                  # 入口：Express 装配 + Socket.io 房间、OT 广播、批注画布
│   ├── db/config.js            # mysql2 连接池
│   ├── middleware/auth.js      # JWT 鉴权，挂 req.user
│   ├── utils/docType.js        # parseDocType：由文件名推导 doc_type
│   ├── router/                 # user / folder / document / share / snapshot / stats
│   └── controller/             # 各模块业务逻辑（stats.js 含埋点与聚合）
├── frontend/
│   └── src/
│       ├── views/              # Login / Home / Editor / Share / Stats
│       ├── components/         # MonacoEditor（只读开关）、CsvTable（网格）、DrawLayer（批注层）
│       ├── utils/ot.js         # diffToOp / applyOp / transform
│       ├── utils/docType.js    # EXT_MAP 映射 + parseExt + resolveDocView
│       ├── utils/csv.js        # validateCsv / parseCsv / stringifyCsv
│       ├── utils/annotation.js # useAnnotation：批注状态与 socket 收发
│       ├── utils/request.js    # axios 实例 + token 拦截器
│       ├── stores/user.js      # Pinia 用户状态
│       └── router/index.js     # 路由与登录守卫
└── docs/                       # 项目规划书、bug 记录
```

## 数据库

```sql
CREATE DATABASE IF NOT EXISTS collab_doc_db DEFAULT CHARSET utf8mb4;
USE collab_doc_db;

CREATE TABLE `user` (
  `id` int unsigned NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `password` varchar(100) NOT NULL COMMENT 'bcrypt加密后的密码',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

CREATE TABLE `folder` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `parent_id` int unsigned DEFAULT NULL COMMENT 'null代表根目录',
  `user_id` int unsigned NOT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文件夹表';

CREATE TABLE `document` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `doc_type` varchar(20) DEFAULT '' COMMENT '由 name 最后一个点之后推导的类型缓存，可为空',
  `folder_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned NOT NULL,
  `content` longtext,
  `status` tinyint DEFAULT '1' COMMENT '1正常 0删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_folder_id` (`folder_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档表';

-- 已有库升级（两列均为追加，不改动原有字段）
-- ALTER TABLE `document` ADD COLUMN `doc_type` varchar(20) DEFAULT '' AFTER `name`;
-- ALTER TABLE `document` ADD COLUMN `update_time` datetime DEFAULT CURRENT_TIMESTAMP
--   ON UPDATE CURRENT_TIMESTAMP AFTER `create_time`;
-- UPDATE `document` SET `doc_type` = LOWER(SUBSTRING_INDEX(`name`, '.', -1))
--   WHERE `name` LIKE '%.%' AND `name` NOT LIKE '%.';

CREATE TABLE `doc_share` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `doc_id` int unsigned NOT NULL,
  `share_code` varchar(64) NOT NULL COMMENT '分享唯一密钥',
  `permission` tinyint NOT NULL COMMENT '1只读 2可编辑',
  `expire_time` datetime DEFAULT NULL COMMENT 'null永不过期',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_share_code` (`share_code`),
  KEY `idx_doc_id` (`doc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档分享记录';

CREATE TABLE `doc_snapshot` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `doc_id` int unsigned NOT NULL,
  `content` longtext NOT NULL COMMENT '快照完整内容',
  `remark` varchar(200) DEFAULT NULL,
  `user_id` int unsigned NOT NULL,
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_id` (`doc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档版本快照';

CREATE TABLE `doc_edit_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `doc_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `operate_type` varchar(20) NOT NULL COMMENT 'insert / delete',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_doc_id` (`doc_id`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='编辑操作日志，用于统计可视化';
```

## 启动

**1. 后端**

```bash
cd backend
npm install
# 先按本机环境修改 db/config.js 里的 host / user / password / database
npm run dev        # nodemon 启动，端口 8888

# 连通性自检：返回 code 200 说明服务与数据库都通了
curl http://127.0.0.1:8888/api/ping
```

**2. 前端**

```bash
cd frontend
npm install
npm run dev        # Vite，端口 8000
```

浏览器访问 `http://localhost:8000`。

## 接口一览

除 `/api/user/*` 与 `GET /api/share/:code` 外，均需请求头 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/user/register` | 注册 |
| POST | `/api/user/login` | 登录，返回 token |
| GET | `/api/folder/list` | 目录树 |
| POST | `/api/folder/create` | 新建文件夹 |
| PUT | `/api/folder/updateName` | 重命名文件夹 |
| DELETE | `/api/folder/delete/:id` | 删除文件夹 |
| GET | `/api/document/list` | 文档列表 |
| POST | `/api/document/create` | 新建文档 |
| GET | `/api/document/:id` | 文档详情 |
| PUT | `/api/document/save` | 保存内容 |
| PUT | `/api/document/updateName` | 重命名文档 |
| DELETE | `/api/document/delete/:id` | 逻辑删除文档 |
| POST | `/api/share/create` | 创建分享，返回 shareCode |
| GET | `/api/share/:code` | 访客拉取文档（公开，无需登录） |
| PUT | `/api/share/save` | 访客保存，仅 permission=2 可写 |
| POST | `/api/snapshot/create` | 保存版本快照 |
| GET | `/api/snapshot/list/:docId` | 版本列表 |
| GET | `/api/snapshot/detail/:id` | 版本完整内容 |
| POST | `/api/snapshot/rollback` | 回滚到指定版本 |
| GET | `/api/stats/summary?days=N` | 编辑统计聚合，返回折线 / 柱状 / 饼图数据与总数 |

## 协同协议

**Socket 事件**

| 方向 | 事件 | 负载 | 说明 |
|---|---|---|---|
| C→S | `joinDoc` | `{docId, userId, username}` | 加入房间并登记在线成员 |
| S→C | `userList` | `[{userId, username}]` | 广播房间成员列表 |
| C→S | `sendOp` | `{docId, op, opId}` | 提交一次编辑操作 |
| S→C | `opAck` | `{opId}` | 回执给发送方，用于清理未确认队列 |
| S→C | `remoteOp` | `{pos, del, ins}` | 向房间内其他客户端广播操作 |
| C→S | `leaveDoc` | `docId` | 离开房间 |

**操作结构**：`{ pos, del, ins }` —— 从 `pos` 起删除 `del` 个字符并插入 `ins` 字符串。

**一次编辑的完整链路**

1. 编辑器内容变化（`watch`）→ `diffToOp(lastText, newText)` 用公共前缀 + 公共后缀压缩出最小差异
2. 本地立即 `applyOp` 生效，`lastText` 更新为新文本，把该 op 记入待确认队列
3. `socket.emit('sendOp', { docId, op, opId })` 发出
4. 服务端回 `opAck { opId }` 给发送方，并向房间内**其他人**广播 `remoteOp`
5. 收到 `remoteOp` 时若本地还有未确认 op，先 `transform(localOp, remoteOp)` 修正坐标再应用，避免互相覆盖
6. 内容变化同时触发 1.2s 防抖的 HTTP 保存，最终落库到 `document.content`

**批注画布事件**

| 方向 | 事件 | 负载 | 说明 |
|---|---|---|---|
| S→C | `boardState` | `[stroke]` | 白板全量笔画，入房、撤销、重连时下发（`joinDoc` 后服务端自动补发） |
| S→C | `annotators` | `[username]` | 当前正在批注的人名列表（`joinDoc` 后自动补发） |
| C→S | `drawStroke` | `{docId, stroke}` | 提交一笔；服务端上限 2000 笔 |
| S→C | `strokeAdded` | `stroke` | 只广播给**其他人**，发送方本地已先画好 |
| C→S | `undoStroke` | `{docId, userId}` | 撤销该 userId 的最后一笔，随后全量下发 `boardState` |
| C→S | `clearBoard` | `{docId}` | 清空全房间白板，广播 `boardCleared` |
| S→C | `boardCleared` | — | 通知各端清空本地笔画 |
| C→S | `drawMode` | `{docId, on, username}` | 上报 / 退出批注状态，广播 `annotators` |

**笔画结构**：`{ id, userId, username, color, width, points: [{x, y}] }`，坐标按画布尺寸归一化到 0~1（保留 4 位小数），因此不同窗口大小的人看到的相对位置一致。

## 文档视图类型

类型**完全由文件名后缀决定**，不做手动切换。规则：取 `name` **最后一个 `.` 之后**的内容并转小写；无点、以点结尾、查不到映射均视为空（纯文本）。

| 后缀 | view | 渲染方式 |
|---|---|---|
| 无 / 未收录 | `text` | Monaco 纯文本 |
| `md` / `markdown` | `markdown` | Monaco 编辑 + marked 预览（可切） |
| `js` / `ts` / `vue` / `py` / `java` / `go` / `c` / `cpp` / `sql` / `sh` / `json` / `html` / `css` / `yml` … | `code` | Monaco 对应语言高亮 |
| `csv` | `table` | `CsvTable` 网格，校验失败退回 Monaco |

两个实现要点：

- `doc_type` 是 `name` 的**缓存**（`parseDocType` 在新建与重命名时写入），`name` 才是事实。前端 `resolveDocView` 优先用 `name` 现算，`doc_type` 仅作兜底——因为 `GET /api/share/:code` 不返回 `doc_type`，分享页只能靠 `name` 推导。
- 类型**不提供强制转换出口**：校验不过就拦住并给出具体行号原因，内容一字不改。

**CSV 校验三规则**（`utils/csv.js` 的 `validateCsv`）

1. 分隔符唯一且每行数量一致（只认 `,` `\t` `|`，不猜空格；数量与首行不一致时提示「第 N 行的分隔符有 M 个，与第 1 行的 K 个不一致」）
2. 引号成对闭合（提示「第 N 行引号未闭合」）
3. 至少两列；上限 500 行渲染 / 2000 行解析 / 1 MB

校验通过才挂网格，不通过提示条 + 退回 Monaco 纯文本。网格编辑走「整表序列化 → `diffToOp`」，复用既有 OT 协议，不做单元格级协议也不加锁。表格类型不可批注（`CsvTable` 可滚动，固定视口画布会错位）。

## 已知限制

1. **新客户端入房无状态同步**：新加入或刷新页面的人读到的是数据库里最后一次保存的内容，而房间内其他人可能还有未落库的实时编辑。当前未实现服务端 `roomState` 下发。
2. **无未确认操作队列的严格定序**：两人在同一位置同时输入时，后到的操作可能把先到的顶掉一次（表现为 `xy` / `yx` 而非稳定有序的结果）。
3. **快照取的是已落库内容**：刚编辑未到防抖保存时间就保存快照，存下的是上一次内容。
4. **访客与所有者走两套接口**：`document` 系列接口按 `user_id` 硬隔离，访客协同通过 `share` 接口单独走，二者未统一为同一套权限模型。
5. **在线成员表为单机内存态**：`roomUsers` 存于进程内存，服务重启即清空，多实例部署需替换为 Redis。
6. **批注画布固定视口**：`DrawLayer` 覆盖在渲染区上、不随滚动移动，文档滚动后已有笔画会与正文错位。这是既定取舍（换来的是跨端坐标一致且无需处理滚动事件）。
7. **批注笔画只存服务端内存**：`roomBoards` 与 `roomAnnotators` 均存于进程内存，服务重启即丢失。房间成员通过 `leaveDoc` 全部退出时一并清理；但所有人都是**异常断线**（直接关窗口、断网）时 `disconnect` 分支只清 `roomUsers`，`roomBoards` 会残留到下次有人进入同一文档（届时旧笔画仍可见），属于已知的小内存泄漏。
8. **批注撤销按 userId 匹配**：只删「该 userId 的最后一笔」。访客必须使用 `getGuestInfo()` 里持久化在 localStorage 的 `guest_user_id`，否则与广播出去的身份不一致、撤不掉自己那笔。

## 迭代进度

- [x] 迭代一：项目骨架、账号体系、目录与文档管理
- [x] 迭代二：Monaco 编辑器、防抖自动保存、本地草稿
- [x] 迭代三：Socket.io 协同、OT 差分、在线成员、断线重连
- [x] 迭代四：文档分享、版本快照
- [x] 迭代五：编辑日志统计（ECharts）
- [x] 迭代六：按文件后缀切换视图（text / markdown / code / table）+ CSV 表格视图
- [x] 迭代七：共享批注画布（固定视口、实时笔画、批注锁与提示）
- [ ] 迭代八（可选）：房间级 `docState` 下发、批注落库、表格内批注
