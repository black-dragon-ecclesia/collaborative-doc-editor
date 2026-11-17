const express = require('express')
const router = express.Router()
const folderCtrl = require('../controller/folder')

router.get('/list', folderCtrl.getFolderList)
router.post('/create', folderCtrl.createFolder)
router.put('/update', folderCtrl.updateFolder)
router.delete('/delete/:id', folderCtrl.deleteFolder)


module.exports = router