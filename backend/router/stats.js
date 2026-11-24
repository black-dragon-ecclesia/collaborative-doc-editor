const express = require('express')
const router = express.Router()
const statsCtrl = require('../controller/stats')

// 统计汇总：折线 + 柱状 + 饼图数据
router.get('/summary', statsCtrl.getStatsSummary)

module.exports = router
