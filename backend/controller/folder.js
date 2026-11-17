/**
 * 文件夹 CRUD 接口
 */
const pool = require('../db/config')

/**
 * 获取当前用户全部文件夹列表
 */
exports.getFolderList = async (req, res) => {
    try {
        const userId = req.user.userId
        const [rows] = await pool.query(
            'SELECT * FROM folder WHERE user_id = ? ORDER BY create_time DESC',
            [userId]
        )
        res.json({ code: 200, data: rows })
    } catch (err) {
        console.error(err)
        res.json({ code: 500, msg: '获取文件夹列表失败' })
    }
}

/**
 * 新建文件夹
 */
exports.createFolder = async (req, res) => {
    try {
        const userId = req.user.userId
        const { name, parentId } = req.body
        if (!name) return res.json({ code: 400, msg: '文件夹名称不能为空' })

        await pool.query(
            'INSERT INTO folder(name,parent_id,user_id) VALUES(?,?,?)',
            [name, parentId || null, userId]
        )
        res.json({ code: 200, msg: '创建文件夹成功' })
    } catch (err) {
        console.error(err)
        res.json({ code: 500, msg: '创建文件夹失败' })
    }
}

/**
 * 修改文件夹名称
 */
exports.updateFolder = async (req, res) => {
    try {
        const userId = req.user.userId
        const { id, name } = req.body
        if (!id || !name) return res.json({ code: 400, msg: '参数不全' })

        const [result] = await pool.query(
            'UPDATE folder SET name=? WHERE id=? AND user_id=?',
            [name, id, userId]
        )
        if (result.affectedRows === 0) {
            return res.json({ code: 400, msg: '文件夹不存在或者无权限' })
        }
        res.json({ code: 200, msg: '修改成功' })
    } catch (err) {
        console.error(err)
        res.json({ code: 500, msg: '修改文件夹失败' })
    }
}

/**
 * 删除文件夹
 */
exports.deleteFolder = async (req, res) => {
    try {
        console.log(req.params)
        const userId = req.user.userId
        const { id } = req.params
        const [result] = await pool.query(
            'DELETE FROM folder WHERE id=? AND user_id=?',
            [id, userId]
        )
        if (result.affectedRows === 0) {
            return res.json({ code: 400, msg: '文件夹不存在或者无权限' })
        }
        res.json({ code: 200, msg: '删除成功' })
    } catch (err) {
        console.error(err)
        res.json({ code: 500, msg: '删除文件夹失败' })
    }
}
