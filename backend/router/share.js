const express = require('express')
const router = express.Router()
const shareCtrl = require('../controller/share')
const authMiddleware = require('../middleware/auth')

// 生成分享链接：必须登录，且只能给自己名下的文档生成
router.post('/create', authMiddleware, shareCtrl.createShare)
// 访客保存内容：公开接口，权限与过期时间由 share_code 校验
router.put('/save', shareCtrl.saveShareDoc)
// 访客读取文档：公开接口，放在最后避免吞掉 /create、/save
router.get('/:code', shareCtrl.getShareDoc)

module.exports = router
