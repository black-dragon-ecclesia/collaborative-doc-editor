const express = require('express')
const router = express.Router()
const docCtrl = require('../controller/document')

router.get('/list', docCtrl.getDocList)
router.post('/create', docCtrl.createDoc)
router.put('/updateName', docCtrl.updateDocName)
router.delete('/delete/:id', docCtrl.deleteDoc)

module.exports = router
