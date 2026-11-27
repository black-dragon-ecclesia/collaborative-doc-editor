const crypto = require('crypto')
const pool = require('../db/config')

// 生成分享链接：1 只读 2 可编辑，expireDays 为空表示永不过期
exports.createShare = async (req, res) => {
    try {
        const userId = req.user.userId
        const { docId, permission, expireDays } = req.body
        if (!docId) return res.json({ code: 400, msg: '文档id不能为空' })

        // 先校验文档归属，防止给别人的文档生成分享
        const [docs] = await pool.query(
            'SELECT id FROM document WHERE id = ? AND user_id = ? AND status = 1',
            [docId, userId]
        )
        if (docs.length === 0) return res.json({ code: 400, msg: '文档不存在或无权限' })

        // 非法权限值统一降级为只读
        const perm = Number(permission) === 2 ? 2 : 1

        // 32 位十六进制分享码，长度在 share_code VARCHAR(64) 范围内
        const shareCode = crypto.randomBytes(16).toString('hex')

        // 有效期换算成绝对时间，不传则写 null
        let expireTime = null
        if (expireDays && Number(expireDays) > 0) {
            expireTime = new Date(Date.now() + Number(expireDays) * 24 * 60 * 60 * 1000)
        }

        await pool.query(
            'INSERT INTO doc_share(doc_id, share_code, permission, expire_time) VALUES (?,?,?,?)',
            [docId, shareCode, perm, expireTime]
        )

        return res.json({ code: 200, msg: '分享链接生成成功', data: { shareCode, permission: perm, expireTime } })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '生成分享链接失败' })
    }
}

// 访客读取文档：靠 share_code 校验，不依赖登录态
exports.getShareDoc = async (req, res) => {
    try {
        const { code } = req.params
        if (!code) return res.json({ code: 400, msg: '分享码不能为空' })

        const [rows] = await pool.query(
            `SELECT s.permission, s.expire_time, d.id AS doc_id, d.name, d.content
             FROM doc_share s
             JOIN document d ON s.doc_id = d.id
             WHERE s.share_code = ? AND d.status = 1`,
            [code]
        )
        if (rows.length === 0) return res.json({ code: 404, msg: '分享链接不存在或文档已删除' })

        const share = rows[0]
        // 过期判断必须在返回内容之前
        if (share.expire_time && new Date(share.expire_time) < new Date()) {
            return res.json({ code: 400, msg: '分享链接已过期' })
        }

        return res.json({
            code: 200,
            data: {
                docId: share.doc_id,
                name: share.name,
                content: share.content || '',
                permission: share.permission,
                expireTime: share.expire_time
            }
        })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '获取分享文档失败' })
    }
}

// 访客保存：仅 permission=2 且未过期允许，按文档主键更新，不校验 user_id
exports.saveShareDoc = async (req, res) => {
    try {
        const { shareCode, content } = req.body
        if (!shareCode) return res.json({ code: 400, msg: '分享码不能为空' })

        const [rows] = await pool.query(
            'SELECT doc_id, permission, expire_time FROM doc_share WHERE share_code = ?',
            [shareCode]
        )
        if (rows.length === 0) return res.json({ code: 404, msg: '分享链接不存在' })

        const share = rows[0]
        if (share.expire_time && new Date(share.expire_time) < new Date()) {
            return res.json({ code: 400, msg: '分享链接已过期' })
        }
        if (Number(share.permission) !== 2) {
            return res.json({ code: 403, msg: '当前分享为只读权限，无权保存' })
        }

        const [result] = await pool.query(
            'UPDATE document SET content = ? WHERE id = ? AND status = 1',
            [content ?? '', share.doc_id]
        )
        if (result.affectedRows === 0) return res.json({ code: 400, msg: '文档不存在或已删除' })

        return res.json({ code: 200, msg: '保存成功' })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '保存失败' })
    }
}
// 列出某文档已创建的分享链接，只有文档所有者能查
exports.listShares = async (req, res) => {
    try {
        const userId = req.user.userId
        const { docId } = req.params
        if (!docId) return res.json({ code: 400, msg: '文档id不能为空' })

        // 校验归属，避免查到别人文档的分享码
        const [docs] = await pool.query(
            'SELECT id FROM document WHERE id = ? AND user_id = ? AND status = 1',
            [docId, userId]
        )
        if (docs.length === 0) return res.json({ code: 400, msg: '文档不存在或无权限' })

        // 新生成的排前面，方便一眼看到最近在用哪条
        const [rows] = await pool.query(
            'SELECT id, share_code, permission, expire_time FROM doc_share WHERE doc_id = ? ORDER BY id DESC',
            [docId]
        )

        const now = Date.now()
        const data = rows.map(r => ({
            id: r.id,
            shareCode: r.share_code,
            permission: Number(r.permission),
            expireTime: r.expire_time,
            // 没有过期时间视为永久有效
            expired: r.expire_time ? new Date(r.expire_time).getTime() < now : false
        }))
        return res.json({ code: 200, data })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '获取分享列表失败' })
    }
}
