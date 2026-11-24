// CSV 工具：解析、序列化，以及"能否以表格视图展示"的三条校验
// 设计原则：转换只改视图不改内容；校验不通过就拦住，并说清哪一行有问题
import Papa from 'papaparse'

// 体量上限：表格视图只适合中小数据，超过就直接拒绝，避免页面卡死
export const MAX_TABLE_ROWS = 500      // 超过不渲染表格
export const MAX_PARSE_ROWS = 2000     // 超过直接拒绝解析
export const MAX_BYTES = 1024 * 1024   // 1MB

// 只认这三种分隔符；空格对齐的文本一律不猜
const CANDIDATES = [',', '\t', '|']

// 统计一行里"引号之外"的分隔符个数，引号内的逗号不算分隔
function countOutsideQuotes(line, d) {
    let count = 0
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            // "" 是转义的双引号，跳过不切换状态
            if (inQuotes && line[i + 1] === '"') { i++; continue }
            inQuotes = !inQuotes
        } else if (ch === d && !inQuotes) {
            count++
        }
    }
    return count
}

// 校验一：引号必须成对闭合
// 说明：不支持单元格内换行，所以按行检查；未闭合直接报行号
function checkQuotes(text) {
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
        let inQuotes = false
        const line = lines[i]
        for (let j = 0; j < line.length; j++) {
            const ch = line[j]
            if (ch === '"') {
                if (inQuotes && line[j + 1] === '"') { j++; continue }
                inQuotes = !inQuotes
            }
        }
        if (inQuotes) return `第 ${i + 1} 行引号未闭合，请先修正该行`
    }
    return ''
}

// 主校验：体量 → 引号 → 分隔符唯一且每行列数一致（至少两列）
// 返回 { ok, delimiter, rowCount } 或 { ok:false, error }
export function validateCsv(text) {
    const raw = text || ''
    // 空文档允许表格视图，渲染成空表
    if (!raw.trim()) return { ok: true, delimiter: ',', rowCount: 0 }

    if (raw.length > MAX_BYTES) {
        return { ok: false, error: '内容超过 1MB，请拆分文档或改用文本视图' }
    }

    const quoteErr = checkQuotes(raw)
    if (quoteErr) return { ok: false, error: quoteErr }

    const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '')
    if (lines.length > MAX_PARSE_ROWS) {
        return { ok: false, error: `内容超过 ${MAX_PARSE_ROWS} 行，请改用文本视图` }
    }
    if (lines.length > MAX_TABLE_ROWS) {
        return { ok: false, error: `内容超过 ${MAX_TABLE_ROWS} 行，表格视图暂不渲染，已按纯文本显示` }
    }

    // 逐个候选分隔符尝试：要求每行该分隔符数量完全一致，且至少 1 个（即至少两列）
    for (const d of CANDIDATES) {
        const counts = lines.map(l => countOutsideQuotes(l, d))
        if (counts[0] >= 1 && counts.every(c => c === counts[0])) {
            return { ok: true, delimiter: d, rowCount: lines.length }
        }
    }

    // 全都不满足时，找出最接近的分隔符，定位第一处不一致的行，给出可操作的提示
    let detail = ''
    for (const d of CANDIDATES) {
        const counts = lines.map(l => countOutsideQuotes(l, d))
        const first = counts[0]
        const badIdx = counts.findIndex(c => c !== first)
        if (first >= 1 && badIdx !== -1) {
            const name = d === '\t' ? 'Tab' : (d === '|' ? '竖线' : '逗号')
            detail = `以${name}分隔时，第 ${badIdx + 1} 行的分隔符有 ${counts[badIdx]} 个，与第 1 行的 ${first} 个不一致`
            break
        }
    }
    return {
        ok: false,
        error: detail || '未检测到统一的分隔符（仅支持逗号、Tab、竖线），或每行只有一列'
    }
}

// 解析成二维数组：以最宽行为准补空，保证网格是矩形
export function parseCsv(text, delimiter = ',') {
    const res = Papa.parse((text || '').trim(), {
        delimiter,
        header: false,
        skipEmptyLines: 'greedy'
    })
    const data = res.data || []
    const width = data.reduce((m, r) => Math.max(m, r.length), 0)
    const rows = data.map(r => {
        const arr = r.slice(0, width)
        while (arr.length < width) arr.push('')
        return arr
    })
    return { header: rows[0] || [], body: rows.slice(1), width }
}

// 二维数组序列化回 CSV：含分隔符、引号、换行的单元格由 papaparse 自动加引号
export function stringifyCsv(rows, delimiter = ',') {
    return Papa.unparse(rows, { delimiter })
}
