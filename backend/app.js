const express = require('express')
const cors = require('cors')
const pool = require('./db/config')
const userRouter = require('./router/user')
const folderRouter = require('./router/folder')
const docRouter = require('./router/document')
const shareRouter = require('./router/share')
const snapshotRouter = require('./router/snapshot')
const statsRouter = require('./router/stats')
const statsCtrl = require('./controller/stats')    // 给 sendOp 埋点用
const authMiddleware = require('./middleware/auth')
const { Server } = require("socket.io")
const jwt = require('jsonwebtoken')
// 必须与 middleware/auth.js 里的 JWT_SECRET 保持一致
//const { JWT_SECRET } = require('./config/env')
// 路径模块
const path = require('path')



const app = express()
const { PORT, JWT_SECRET } = require('./config/env')


//中间件
app.use(cors())
app.use(express.json()) //解析post的json请求体

//测试接口
app.get('/api/ping', async (req, res) => {
    try {
        await pool.query('SELECT 1')
        res.json({ code: 200, msg: "后端服务运行成功，数据库连接正常" })
    } catch (e) {
        res.json({ code: 500, msg: "后端运行，但数据库连接失败", err: e.message })
    }
})

// 受保护接口，必须携带token才能访问
app.get('/api/profile', authMiddleware, (req, res) => {
    // req.user 是中间件解析出来的登录用户信息
    res.json({
        code: 200,
        msg: "获取个人信息成功",
        data: req.user
    })
})

app.use('/api/user', userRouter) //用户登录注册相关接口
app.use('/api/folder', authMiddleware, folderRouter) //文件夹相关接口
app.use('/api/document', authMiddleware, docRouter) //文档相关接口
app.use('/api/share', shareRouter) //分享相关接口
app.use('/api/snapshot', authMiddleware, snapshotRouter) //快照相关接口
app.use('/api/stats', authMiddleware, statsRouter) //统计汇总相关接口

// ===== 生产部署：托管前端构建产物 =====
// 静态文件服务，处理 /api 以下的请求 ，返回前端构建产物
app.use(express.static(path.join(__dirname, '../frontend/dist')))

// 非 /api 的 GET 请求统一回落 index.html，交给前端路由处理
app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'))
})



const server = app.listen(PORT, () => {
    console.log('服务启动在 8888')
})

// server 为 app.listen 创建的 http 服务实例
const io = new Server(server, {
    cors: {
        // origin 填写前端页面完整访问地址
        //origin: ["http://127.0.0.1:8000", "http://127.0.0.1:5173", "http://localhost:8000", "http://localhost:5173"],
        origin: true,
        methods: ["GET", "POST"]
    }
})

// 房间在线成员表：docId -> Map(socketId -> { userId, username })
// 用内存维护，服务重启即清空，后续可换成 Redis
const roomUsers = new Map()
// 房间实时全文状态表：docId -> text
const roomState = new Map()

// 判断某个 socket 对某文档是否有写权限
// 所有者：握手带 JWT，且能查到 document.user_id 匹配；访客：握手带分享码，且 permission=2 未过期
async function resolveCanEdit(socket, docId) {
    try {
        if (socket.authUserId) {
            const [rows] = await pool.query(
                'SELECT 1 FROM document WHERE id = ? AND user_id = ? AND status = 1',
                [docId, socket.authUserId]
            )
            return rows.length > 0
        }
        if (socket.authShareCode) {
            const [rows] = await pool.query(
                'SELECT permission, expire_time FROM doc_share WHERE share_code = ? AND doc_id = ?',
                [socket.authShareCode, docId]
            )
            if (!rows.length) return false
            const r = rows[0]
            if (Number(r.permission) !== 2) return false
            if (r.expire_time && new Date(r.expire_time) < new Date()) return false
            return true
        }
    } catch (e) {
        console.error('解析写权限失败:', e.message)
    }
    return false
}

// 把一次差分操作应用到文本上，用于维护房间实时全文
function applyOpToText(text, op) {
    if (!op) return text
    const pos = op.pos || 0
    return text.slice(0, pos) + (op.ins || '') + text.slice(pos + (op.del || 0))
}

// 确保某房间有状态：没有则从数据库初始化一次
async function ensureRoomState(docId) {
    if (roomState.has(docId)) return roomState.get(docId)
    const [rows] = await pool.query(
        'SELECT content FROM document WHERE id = ? AND status = 1',
        [docId]
    )
    const text = rows.length ? (rows[0].content || '') : ''
    roomState.set(docId, text)
    return text
}

// 取某个房间的在线用户列表，按 userId 去重（同一账号开两个标签页只显示一次）
function getRoomUserList(docId) {
    const users = roomUsers.get(docId)
    if (!users) return []
    const result = []
    const seen = new Set()
    for (const u of users.values()) {
        if (seen.has(u.userId)) continue
        seen.add(u.userId)
        result.push({ userId: u.userId, username: u.username })
    }
    return result
}

// 把某个 socket 从房间里摘掉，并返回该 socket 是否还留在别的连接里
function removeSocketFromRoom(docId, socketId) {
    const users = roomUsers.get(docId)
    if (!users) return
    users.delete(socketId)
    if (users.size === 0) roomUsers.delete(docId)
}

// 文档批注白板：docId -> 笔画数组，只存内存，服务重启即清空
const roomBoards = new Map()
// 正在批注的人：docId -> Map(socketId -> username)，用于"谁在批注"提示
const roomAnnotators = new Map()

// 取某房间的笔画列表，没有就返回空数组
function getBoardStrokes(docId) {
    return roomBoards.get(docId) || []
}

// 取某房间当前批注人名（按名字去重）
function getAnnotatorNames(docId) {
    const m = roomAnnotators.get(docId)
    if (!m) return []
    return [...new Set(m.values())]
}

// 某人退出时把他从所有房间的批注名单里摘掉，并广播最新名单
function removeAnnotatorEverywhere(socketId) {
    for (const [docId, m] of roomAnnotators) {
        if (m.has(socketId)) {
            m.delete(socketId)
            if (m.size === 0) roomAnnotators.delete(docId)
            io.to(docId).emit('annotators', getAnnotatorNames(docId))
        }
    }
}


// 监听客户端连接事件
io.on('connection', (socket) => {
    console.log('客户端建立连接, socketId:', socket.id);

    // 握手阶段先认身份，后续 joinDoc / sendOp 都据此判断权限
    try {
        const { token, shareCode } = socket.handshake.auth || {}
        if (token) socket.authUserId = jwt.verify(token, JWT_SECRET).userId
        socket.authShareCode = shareCode || null
    } catch (e) {
        socket.authUserId = null
    }

    // 加入文档房间：房间编号使用文档id，用户信息由前端登录态传入
    socket.on('joinDoc', async (payload) => {
        if (!payload || !payload.docId) return
        const docId = String(payload.docId)
        socket.join(docId)

        // socket 回调里没有 req，用户信息只能从 joinDoc 的负载里取
        socket.docId = docId
        socket.userId = payload.userId
        socket.username = payload.username
        // 检查是否有写权限
        socket.canEdit = await resolveCanEdit(socket, docId)
        // 确保房间有状态
        const state = await ensureRoomState(docId)

        if (!roomUsers.has(docId)) roomUsers.set(docId, new Map())
        roomUsers.get(docId).set(socket.id, {
            userId: payload.userId,
            username: payload.username
        })

        // 发给房间里所有人（含自己），这样后进来的人也能立刻拿到完整在线列表
        io.to(docId).emit('userList', getRoomUserList(docId))
        // 下发房间状态，让新加入的人看到历史内容
        socket.emit('docState', state)
        // 下发房间白板的现有笔画，让新加入的人看到历史批注
        socket.emit('boardState', getBoardStrokes(docId))
        // 下发当前连接的写权限，前端据此决定是否禁用编辑功能
        socket.emit('docPermission', { canEdit: socket.canEdit })
        // 下发当前正在批注的人
        socket.emit('annotators', getAnnotatorNames(docId))
        console.log(`socket ${socket.id} 加入文档房间: ${docId}`)
    })

    // 接收编辑操作，向同房间内其他客户端广播操作
    socket.on('sendOp', (data) => {
        if (!data || !data.docId) return
        const docId = String(data.docId)
        if (!socket.canEdit) {
            socket.emit('opRejected', { opId: data.opId })
            return
        }
        socket.emit('opAck', { opId: data.opId }) // 给自己回个ack，前端可用来清除本地缓存的未确认操作
        socket.to(String(data.docId)).emit('remoteOp', data.op)
        // 同步维护房间实时全文，供后来者入房时下发
        const cur = roomState.get(docId)
        if (typeof cur === 'string') {
            roomState.set(docId, applyOpToText(cur, data.op))
        }

        // 埋点：有插入记 insert，纯删除记 delete；没登录身份的人不记，避免脏数据
        const insLen = data.op && data.op.ins ? data.op.ins.length : 0
        const hasDel = data.op && data.op.del > 0
        // 访客 userId 是 guest_xxx 字符串，写 int 列会报错，直接跳过
        const isNumericUser = /^\d+$/.test(String(socket.userId))
        if (isNumericUser && (insLen > 0 || hasDel)) {
            statsCtrl.logEditOp(Number(data.docId), Number(socket.userId), insLen > 0 ? 'insert' : 'delete')
        }
        // if (socket.userId && (insLen > 0 || hasDel)) {
        //     statsCtrl.logEditOp(Number(data.docId), socket.userId, insLen > 0 ? 'insert' : 'delete')
        // }
    })

    // 离开房间
    socket.on('leaveDoc', (docId) => {
        if (!docId) return
        docId = String(docId)
        socket.leave(docId)
        removeSocketFromRoom(docId, socket.id)
        // 离开房间时同步退出批注名单，避免"正在批注"提示残留
        removeAnnotatorEverywhere(socket.id)
        // 房间没人时把白板一起清掉，与 disconnect 保持一致
        if (!roomUsers.has(docId)) {
            roomBoards.delete(docId)
            roomAnnotators.delete(docId)
        }
        io.to(docId).emit('userList', getRoomUserList(docId))
        // 清掉当前房间标记，避免 disconnected 时再重复广播一次
        if (socket.docId === docId) socket.docId = null
        console.log(`socket ${socket.id} 离开文档房间: ${docId}`)
    })

    // 断开连接：disconnect 阶段 socket.rooms 已被清空，无法靠它遍历房间
    // 改为遍历内存成员表 roomUsers，按 socket.id 精确摘除并推送最新列表
    socket.on('disconnect', () => {
        for (const docId of roomUsers.keys()) {
            const users = roomUsers.get(docId)
            if (users && users.has(socket.id)) {
                users.delete(socket.id)
                // 房间没人了就删掉整个房间记录，避免内存越积越多
                if (users.size === 0) {
                    roomUsers.delete(docId)
                    roomBoards.delete(docId)
                    roomAnnotators.delete(docId)
                }
                //if (users.size === 0) roomUsers.delete(docId)
                io.to(docId).emit('userList', getRoomUserList(docId))
            }
        }
        // 断线同样清理批注身份
        removeAnnotatorEverywhere(socket.id)
        console.log('客户端断开连接, socketId:', socket.id);
    })

    // 收到一笔批注：点数已在前端压缩，这里只做存储与转发
    socket.on('drawStroke', (data) => {
        if (!data || !data.docId || !data.stroke) return
        const docId = String(data.docId)
        if (!roomBoards.has(docId)) roomBoards.set(docId, [])
        const list = roomBoards.get(docId)
        // 内存保护：超过 2000 笔就不再增长，避免恶意刷爆进程
        if (list.length >= 2000) return
        list.push(data.stroke)
        // 只发给房间内其他人，自己那笔已经在本地画好了
        socket.to(docId).emit('strokeAdded', data.stroke)
    })

    // 撤销：只删该用户自己的最后一笔，然后全量下发让所有人重绘
    socket.on('undoStroke', (data) => {
        if (!data || !data.docId) return
        const docId = String(data.docId)
        const list = roomBoards.get(docId) || []
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].userId === data.userId) {
                list.splice(i, 1)
                break
            }
        }
        io.to(docId).emit('boardState', list)
    })

    // 清空白板：所有人一起清
    socket.on('clearBoard', (data) => {
        if (!data || !data.docId) return
        const docId = String(data.docId)
        roomBoards.set(docId, [])
        io.to(docId).emit('boardCleared')
    })

    // 批注状态开关：广播"谁正在批注"，其他人据此提示并自行决定要不要停手
    socket.on('drawMode', (data) => {
        if (!data || !data.docId) return
        const docId = String(data.docId)
        if (!roomAnnotators.has(docId)) roomAnnotators.set(docId, new Map())
        const m = roomAnnotators.get(docId)
        if (data.on) {
            m.set(socket.id, data.username || socket.username || '访客')
        } else {
            m.delete(socket.id)
        }
        if (m.size === 0) roomAnnotators.delete(docId)
        io.to(docId).emit('annotators', getAnnotatorNames(docId))
    })

})
