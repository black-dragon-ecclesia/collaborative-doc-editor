const express = require('express')
const router = express.Router()
const snapshotCtrl = require('../controller/snapshot')

// 保存快照
router.post('/create', snapshotCtrl.createSnapshot)
// 版本列表，按文档id查
router.get('/list/:docId', snapshotCtrl.getSnapshotList)
// 版本详情，预览用
router.get('/detail/:id', snapshotCtrl.getSnapshotDetail)
// 回滚到指定版本
router.post('/rollback', snapshotCtrl.rollbackSnapshot)

module.exports = router
