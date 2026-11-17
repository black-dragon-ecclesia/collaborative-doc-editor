const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('../db/config')

// 开发环境密钥，后面放到.env，先临时写这里
const JWT_SECRET = 'collab-doc-secret-2026-dev'

/**
 * 用户注册
 */
exports.register = async (req, res) => {
    try {
        const { username, password } = req.body
        if (!username || !password) {
            return res.json({ code: 400, msg: '用户名和密码不能为空' })
        }
        // 查询用户名是否已存在
        const [exist] = await pool.query('SELECT id FROM `user` WHERE username = ?', [username])
        if (exist.length > 0) {
            return res.json({ code: 400, msg: '该用户名已被占用' })
        }
        // 密码哈希加密
        const salt = bcrypt.genSaltSync(10)
        const hashPwd = bcrypt.hashSync(password, salt)

        await pool.query('INSERT INTO `user`(username,password) VALUES(?,?)', [username, hashPwd])
        return res.json({ code: 200, msg: '注册成功' })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '注册服务器异常' })
    }
}

/**
 * 用户登录
 */
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body
        if (!username || !password) {
            return res.json({ code: 400, msg: '用户名和密码不能为空' })
        }
        const [rows] = await pool.query('SELECT id,username,password FROM `user` WHERE username = ?', [username])
        if (rows.length === 0) {
            return res.json({ code: 400, msg: '用户名不存在' })
        }
        const user = rows[0]
        // 校验密码
        const ok = bcrypt.compareSync(password, user.password)
        if (!ok) {
            return res.json({ code: 400, msg: '密码错误' })
        }
        // 生成token，有效期 2小时
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' })
        res.json({
            code: 200,
            msg: '登录成功',
            data: {
                token,
                userId: user.id,
                username: user.username
            }
        })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '登录服务器异常' })
    }
}
