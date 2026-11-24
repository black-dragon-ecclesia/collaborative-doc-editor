// 编辑统计控制器：负责埋点写入与统计聚合
const pool = require('../db/config')

// 单条编辑日志埋点，由 socket 的 sendOp 调用
// 埋点失败绝不能影响协同主链路，所以只打印日志、不抛错、不阻塞
exports.logEditOp = (docId, userId, operateType) => {
    pool.query(
        'INSERT INTO doc_edit_log(doc_id, user_id, operate_type) VALUES (?,?,?)',
        [docId, userId, operateType]
    ).catch(err => console.error('写编辑日志失败:', err.message))
}

// 统计汇总：一次请求返回折线、柱状、饼图三份数据，减少前端请求次数
exports.getStatsSummary = async (req, res) => {
    try {
        const userId = req.user.userId
        // 天数限制在 7~30 之间，防止前端传怪值把查询拉爆
        const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 30)

        // 折线：近 N 天每天的编辑次数，按日期升序
        const [lineRows] = await pool.query(
            `SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS d, COUNT(*) AS c
             FROM doc_edit_log
             WHERE user_id = ? AND create_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
             GROUP BY d
             ORDER BY d ASC`,
            [userId, days]
        )

        // 补齐没有数据的日期，否则折线会断点
        const dateMap = {}
        lineRows.forEach(r => { dateMap[r.d] = r.c })
        const labels = []
        const counts = []
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date()
            d.setDate(d.getDate() - i)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            labels.push(key)
            counts.push(dateMap[key] || 0)
        }

        // 柱状：编辑次数最多的前 5 篇文档
        const [barRows] = await pool.query(
            `SELECT d.name AS name, COUNT(*) AS c
             FROM doc_edit_log l
             JOIN document d ON l.doc_id = d.id
             WHERE l.user_id = ? AND d.status = 1
             GROUP BY l.doc_id, d.name
             ORDER BY c DESC
             LIMIT 5`,
            [userId]
        )

        // 饼图：插入与删除的占比
        const [pieRows] = await pool.query(
            `SELECT operate_type, COUNT(*) AS c
             FROM doc_edit_log
             WHERE user_id = ?
             GROUP BY operate_type`,
            [userId]
        )

        const insertCount = (pieRows.find(r => r.operate_type === 'insert') || {}).c || 0
        const deleteCount = (pieRows.find(r => r.operate_type === 'delete') || {}).c || 0

        return res.json({
            code: 200,
            data: {
                days,
                line: { labels, counts },
                bar: {
                    labels: barRows.map(r => r.name),
                    values: barRows.map(r => r.c)
                },
                pie: [
                    { name: '插入', value: insertCount },
                    { name: '删除', value: deleteCount }
                ],
                total: insertCount + deleteCount
            }
        })
    } catch (err) {
        console.error(err)
        return res.json({ code: 500, msg: '获取统计数据失败' })
    }
}
