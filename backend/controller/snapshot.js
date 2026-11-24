// 版本快照控制器：保存快照、版本列表、版本详情、回滚
const pool = require('../db/config')

// 保存快照：把当前已落库的文档内容整份存入 doc_snapshot
exports.createSnapshot = async (req, res) => {
    try {
        const userId = req.user.userId
        const { docId, remark } = req.body
        if (!docId) return res.json({ code: 400, msg: '文档id不能为空' })

        // 校验归属并取出当前内容
        const [docs] = await pool.query(
            'SELECT content FROM document WHERE id = ? AND user_id = ? AND status = 1',
            [docId, userId]
        )
        if (docs.length === 0) return res.json({ code: 400, msg: '文档不存在或无权限' })

        await pool.query(
            'INSERT INTO doc_snapshot(doc_id, content, remark, user_id) VALUES (?,?,?,?)',
            [docId, docs[0].content || '', remark || '', userId]
        )
        return res.json({ code: 200, msg: '快照保存成功' })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '保存快照失败' })
    }
}

// 版本列表：只回预览片段，避免一次传几十条全文
exports.getSnapshotList = async (req, res) => {
    try {
        const userId = req.user.userId
        const { docId } = req.params

        // 先确认文档归属，防止越权查看别人版本历史
        const [docs] = await pool.query(
            'SELECT id FROM document WHERE id = ? AND user_id = ? AND status = 1',
            [docId, userId]
        )
        if (docs.length === 0) return res.json({ code: 400, msg: '文档不存在或无权限' })

        const [rows] = await pool.query(
            `SELECT id, doc_id, remark, user_id, create_time,
                    SUBSTRING(content, 1, 100) AS preview
             FROM doc_snapshot
             WHERE doc_id = ?
             ORDER BY create_time DESC, id DESC`,
            [docId]
        )
        return res.json({ code: 200, data: rows })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '获取版本列表失败' })
    }
}

// 版本详情：预览弹窗用，返回完整内容
exports.getSnapshotDetail = async (req, res) => {
    try {
        const userId = req.user.userId
        const { id } = req.params

        // 关联 document 校验归属，避免直接按 snapshotId 越权读取
        const [rows] = await pool.query(
            `SELECT s.id, s.doc_id, s.content, s.remark, s.create_time
             FROM doc_snapshot s
             JOIN document d ON s.doc_id = d.id
             WHERE s.id = ? AND d.user_id = ? AND d.status = 1`,
            [id, userId]
        )
        if (rows.length === 0) return res.json({ code: 400, msg: '版本不存在或无权限' })

        return res.json({ code: 200, data: rows[0] })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '获取版本详情失败' })
    }
}

// 回滚：把快照内容写回 document.content，并把内容返回给前端
exports.rollbackSnapshot = async (req, res) => {
    try {
        const userId = req.user.userId
        const { snapshotId } = req.body
        if (!snapshotId) return res.json({ code: 400, msg: '版本id不能为空' })

        const [rows] = await pool.query(
            `SELECT s.content, s.doc_id
             FROM doc_snapshot s
             JOIN document d ON s.doc_id = d.id
             WHERE s.id = ? AND d.user_id = ? AND d.status = 1`,
            [snapshotId, userId]
        )
        if (rows.length === 0) return res.json({ code: 400, msg: '版本不存在或无权限' })

        const snap = rows[0]
        const [result] = await pool.query(
            'UPDATE document SET content = ? WHERE id = ? AND status = 1',
            [snap.content, snap.doc_id]
        )
        if (result.affectedRows === 0) return res.json({ code: 400, msg: '文档不存在或已删除' })

        return res.json({
            code: 200,
            msg: '回滚成功',
            data: { docId: snap.doc_id, content: snap.content }
        })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '回滚失败' })
    }
}
