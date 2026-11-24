// 文档类型解析：类型完全由文件名推导，数据库里的 doc_type 只是它的一份缓存
// 规则：取最后一个 "." 之后的内容并转小写；无点、以点结尾、解析为空 → 空串（前端按纯文本处理）
function parseDocType(name) {
    if (!name) return ''
    const idx = name.lastIndexOf('.')
    if (idx === -1) return ''
    // 截断到 20 字符，防止超长后缀超出 doc_type 字段长度导致写库报错
    return name.slice(idx + 1).trim().toLowerCase().slice(0, 20)
}

module.exports = { parseDocType }
