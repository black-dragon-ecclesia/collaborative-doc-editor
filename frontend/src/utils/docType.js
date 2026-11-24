// 文档类型映射：类型由文件名后缀决定，前端在这里统一翻译成「视图 + Monaco 语言 + 展示名」
// 查不到的后缀一律回退纯文本；以后新增类型只改这张表，后端一行都不用动

const EXT_MAP = {
    '': { view: 'text', language: 'plaintext', label: '纯文本' },
    txt: { view: 'text', language: 'plaintext', label: '纯文本' },
    md: { view: 'markdown', language: 'markdown', label: 'Markdown' },
    markdown: { view: 'markdown', language: 'markdown', label: 'Markdown' },
    json: { view: 'code', language: 'json', label: 'JSON' },
    js: { view: 'code', language: 'javascript', label: 'JavaScript' },
    ts: { view: 'code', language: 'typescript', label: 'TypeScript' },
    py: { view: 'code', language: 'python', label: 'Python' },
    java: { view: 'code', language: 'java', label: 'Java' },
    c: { view: 'code', language: 'c', label: 'C' },
    cpp: { view: 'code', language: 'cpp', label: 'C++' },
    go: { view: 'code', language: 'go', label: 'Go' },
    rs: { view: 'code', language: 'rust', label: 'Rust' },
    php: { view: 'code', language: 'php', label: 'PHP' },
    rb: { view: 'code', language: 'ruby', label: 'Ruby' },
    sql: { view: 'code', language: 'sql', label: 'SQL' },
    html: { view: 'code', language: 'html', label: 'HTML' },
    css: { view: 'code', language: 'css', label: 'CSS' },
    xml: { view: 'code', language: 'xml', label: 'XML' },
    yaml: { view: 'code', language: 'yaml', label: 'YAML' },
    yml: { view: 'code', language: 'yaml', label: 'YAML' },
    sh: { view: 'code', language: 'shell', label: 'Shell' },
    vue: { view: 'code', language: 'html', label: 'Vue' },
    csv: { view: 'table', language: 'plaintext', label: 'CSV 表格' },
    tsv: { view: 'table', language: 'plaintext', label: 'TSV 表格' }
}

// 取文件名最后一个点之后的内容，规则与后端 parseDocType 完全一致
export function parseExt(name) {
    if (!name) return ''
    const idx = name.lastIndexOf('.')
    if (idx === -1) return ''
    return name.slice(idx + 1).trim().toLowerCase().slice(0, 20)
}

// 解析文档视图：只要 name 存在就以 name 现算，doc_type 只作为 name 缺失时的兜底
// 这样即使数据库里的 doc_type 漏更新，界面也不会错
export function resolveDocView(doc) {
    const name = doc && doc.name
    const ext = name ? parseExt(name) : ((doc && doc.doc_type) || '')
    return EXT_MAP[ext] || { view: 'text', language: 'plaintext', label: '纯文本' }
}
