// 全局唯一的配置入口：dotenv 在这里加载，其他模块只从这里取值
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// 必填项缺一个就直接启动失败，比跑到一半才报错好排查
const required = ['JWT_SECRET', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
const missing = required.filter(k => !process.env[k])
if (missing.length) {
    throw new Error('缺少环境变量: ' + missing.join(', ') + '（请检查 backend/.env）')
}

module.exports = {
    PORT: Number(process.env.PORT) || 8888,
    JWT_SECRET: process.env.JWT_SECRET,
    DB: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        charset: 'utf8mb4',
        waitForConnections: true,
        connectionLimit: 10
    }
}
