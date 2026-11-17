const express = require('express')
const cors = require('cors')
const pool = require('./db/config')
const userRouter = require('./router/user')
const folderRouter = require('./router/folder')
const docRouter = require('./router/document')
const authMiddleware = require('./middleware/auth')

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

app.listen(PORT, () => {
    console.log(`后端服务启动，端口：${PORT}`)
})
