//JWT 鉴权中间件，后面文档、目录相关接口都要靠这个中间件校验登录状态。
const jwt = require('jsonwebtoken')
const JWT_SECRET = 'collab-doc-secret-2026-dev'

/**
 * JWT登录鉴权中间件
 * 请求头携带 Authorization: Bearer ${token}
 */
module.exports = function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.json({ code: 401, msg: '未登录，请先登录' })
    }
    const token = authHeader.split(' ')[1]
    try {
        // 解析token，把用户信息挂载到req对象上，后续控制器直接拿 req.user
        const payload = jwt.verify(token, JWT_SECRET)
        req.user = {
            userId: payload.userId,
            username: payload.username
        }
        next()
    } catch (err) {
        return res.json({ code: 401, msg: 'token无效或已过期，请重新登录' })
    }
}
