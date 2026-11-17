// 注意：引入 mysql2，不是 mysql2/promise
const mysql = require('mysql2');

// 创建普通回调模式连接池
const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '1597532648Ljh',
    database: 'collab_doc_db',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10
});

// 调用 .promise() 转换成 async/await 可用的promise对象
const promisePool = pool.promise();

module.exports = promisePool;
