// 注意：引入 mysql2，不是 mysql2/promise
const mysql = require('mysql2')
const { DB } = require('../config/env')

// 创建普通回调模式连接池，参数全部来自环境变量
const pool = mysql.createPool(DB)

// 调用 .promise() 转换成 async/await 可用的 promise 对象
const promisePool = pool.promise()

module.exports = promisePool
