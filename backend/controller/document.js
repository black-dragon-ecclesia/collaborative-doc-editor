const pool = require('../db/config')

// 获取当前用户所有文档（status=1有效）
exports.getDocList = async (req, res) => {
    try {
        const userId = req.user.userId
        const [rows] = await pool.query(
            'SELECT * FROM document WHERE user_id = ? AND status = 1 ORDER BY create_time DESC',
            [userId]
        )
        return res.json({ code: 200, data: rows })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '获取文档列表失败' })
    }
}

// 创建空白文档
exports.createDoc = async (req, res) => {
    try {
        const userId = req.user.userId
        const { name, folderId } = req.body
        if (!name) {
            return res.json({ code: 400, msg: '文档名称不能为空' })
        }
        await pool.query(
            'INSERT INTO document(name, folder_id, user_id, content) VALUES (?,?,?,?)',
            [name, folderId || null, userId, '']
        )
        return res.json({ code: 200, msg: '文档创建成功' })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '创建文档失败' })
    }
}

// 修改文档名称
exports.updateDocName = async (req, res) => {
    try {
        const userId = req.user.userId
        const { id, name } = req.body
        if (!id || !name) return res.json({ code: 400, msg: '参数不全' })

        const [result] = await pool.query(
            'UPDATE document SET name = ? WHERE id = ? AND user_id = ? AND status = 1',
            [name, id, userId]
        )
        if (result.affectedRows === 0) {
            return res.json({ code: 400, msg: '文档不存在或无权限' })
        }
        return res.json({ code: 200, msg: '修改文档名称成功' })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '修改文档失败' })
    }
}

// 逻辑删除文档 status置0
exports.deleteDoc = async (req, res) => {
    try {
        const userId = req.user.userId
        const { id } = req.params
        const [result] = await pool.query(
            'UPDATE document SET status = 0 WHERE id = ? AND user_id = ?',
            [id, userId]
        )
        if (result.affectedRows === 0) {
            return res.json({ code: 400, msg: '文档不存在或无权限' })
        }
        return res.json({ code: 200, msg: '删除文档成功' })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '删除文档失败' })
    }
}

// 根据id获取文档详情（内容）
exports.getDocDetail = async (req, res) => {
    try {
        const userId = req.user.userId
        const { id } = req.params
        const [rows] = await pool.query(
            'SELECT * FROM document WHERE id = ? AND user_id = ? AND status = 1',
            [id, userId]
        )
        if (rows.length === 0) {
            return res.json({ code: 400, msg: '文档不存在或者无权访问' })
        }
        return res.json({ code: 200, data: rows[0] })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '获取文档详情失败' })
    }
}

// 保存文档内容
exports.saveDocContent = async (req, res) => {
    try {
        const userId = req.user.userId
        const { id, content } = req.body
        const [result] = await pool.query(
            'UPDATE document SET content = ? WHERE id = ? AND user_id = ? AND status =1',
            [content, id, userId]
        )
        if (result.affectedRows === 0) {
            return res.json({ code: 400, msg: '文档不存在或者无权修改' })
        }
        return res.json({ code: 200, msg: '保存成功' })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '保存失败' })
    }
}

