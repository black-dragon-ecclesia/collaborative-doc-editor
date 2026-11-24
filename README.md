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

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3（`<script setup>`）、Vite、Vue Router、Pinia、Element Plus、Monaco Editor、axios、socket.io-client |
| 后端 | Node.js + Express 5、JWT（jsonwebtoken）、bcryptjs、mysql2、socket.io |
| 数据库 | MySQL 8（`collab_doc_db`，utf8mb4） |
| 协议 | HTTP REST + WebSocket（Socket.io） |

## 目录结构

```
collaborative-doc-editor/
├── backend/
│   ├── app.js                  # 入口：Express 装配 + Socket.io 房间与 OT 广播
│   ├── db/config.js            # mysql2 连接池
│   ├── middleware/auth.js      # JWT 鉴权，挂 req.user
│   ├── router/                 # user / folder / document / share / snapshot
│   └── controller/             # 各模块业务逻辑
├── frontend/
│   └── src/
│       ├── views/              # Login / Home / Editor / Share
│       ├── components/         # MonacoEditor（含只读开关）
│       ├── utils/ot.js         # diffToOp / applyOp / transform
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
  `folder_id` int unsigned DEFAULT NULL,
  `user_id` int unsigned NOT NULL,
  `content` longtext,
  `status` tinyint DEFAULT '1' COMMENT '1正常 0删除',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_folder_id` (`folder_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文档表';

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

## 已知限制

1. **新客户端入房无状态同步**：新加入或刷新页面的人读到的是数据库里最后一次保存的内容，而房间内其他人可能还有未落库的实时编辑。当前未实现服务端 `roomState` 下发。
2. **无未确认操作队列的严格定序**：两人在同一位置同时输入时，后到的操作可能把先到的顶掉一次（表现为 `xy` / `yx` 而非稳定有序的结果）。
3. **快照取的是已落库内容**：刚编辑未到防抖保存时间就保存快照，存下的是上一次内容。
4. **访客与所有者走两套接口**：`document` 系列接口按 `user_id` 硬隔离，访客协同通过 `share` 接口单独走，二者未统一为同一套权限模型。
5. **在线成员表为单机内存态**：`roomUsers` 存于进程内存，服务重启即清空，多实例部署需替换为 Redis。

## 迭代进度

- [x] 迭代一：项目骨架、账号体系、目录与文档管理
- [x] 迭代二：Monaco 编辑器、防抖自动保存、本地草稿
- [x] 迭代三：Socket.io 协同、OT 差分、在线成员、断线重连
- [x] 迭代四：文档分享、版本快照（收尾进行中：README / bug 记录 / 异常处理）
- [ ] 迭代五（可选）：编辑日志统计（ECharts）+ Canvas 画布
