const express = require('express')
const cors = require('cors')
const pool = require('./db/config')
const userRouter = require('./router/user')
const folderRouter = require('./router/folder')
const docRouter = require('./router/document')
const shareRouter = require('./router/share')
const snapshotRouter = require('./router/snapshot')
const authMiddleware = require('./middleware/auth')
const { Server } = require("socket.io")

const app = express()
const PORT = 8888


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

const server = app.listen(PORT, () => {
    console.log('服务启动在 8888')
})

// server 为 app.listen 创建的 http 服务实例
const io = new Server(server, {
    cors: {
        // origin 填写前端页面完整访问地址
        origin: ["http://127.0.0.1:8000", "http://127.0.0.1:5173", "http://localhost:8000", "http://localhost:5173"],
        methods: ["GET", "POST"]
    }
})

// 房间在线成员表：docId -> Map(socketId -> { userId, username })
// 用内存维护，服务重启即清空，后续可换成 Redis
const roomUsers = new Map()

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

// 监听客户端连接事件
io.on('connection', (socket) => {
    console.log('客户端建立连接, socketId:', socket.id);

    // 加入文档房间：房间编号使用文档id，用户信息由前端登录态传入
    socket.on('joinDoc', (payload) => {
        if (!payload || !payload.docId) return
        const docId = String(payload.docId)
        socket.join(docId)

        // socket 回调里没有 req，用户信息只能从 joinDoc 的负载里取
        socket.docId = docId
        socket.userId = payload.userId
        socket.username = payload.username

        if (!roomUsers.has(docId)) roomUsers.set(docId, new Map())
        roomUsers.get(docId).set(socket.id, {
            userId: payload.userId,
            username: payload.username
        })

        // 发给房间里所有人（含自己），这样后进来的人也能立刻拿到完整在线列表
        io.to(docId).emit('userList', getRoomUserList(docId))
        console.log(`socket ${socket.id} 加入文档房间: ${docId}`)
    })

    // 接收编辑操作，向同房间内其他客户端广播操作
    socket.on('sendOp', (data) => {
        if (!data || !data.docId) return
        socket.emit('opAck', { opId: data.opId }) // 给自己回个ack，前端可用来清除本地缓存的未确认操作
        socket.to(String(data.docId)).emit('remoteOp', data.op)
    })

    // 离开房间
    socket.on('leaveDoc', (docId) => {
        if (!docId) return
        docId = String(docId)
        socket.leave(docId)
        removeSocketFromRoom(docId, socket.id)
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
                if (users.size === 0) roomUsers.delete(docId)
                io.to(docId).emit('userList', getRoomUserList(docId))
            }
        }
        console.log('客户端断开连接, socketId:', socket.id);
    })
})
