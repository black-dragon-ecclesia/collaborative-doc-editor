// 简易 OT 工具：把全文差异压成单个操作，并按位置应用
// 操作结构统一为 { pos, del, ins }：从 pos 起删掉 del 个字符，插入 ins 字符串

// 计算 oldText → newText 的最小差异，只保留公共前缀与公共后缀之外的一段
// 返回 null 表示内容未变化
export function diffToOp(oldText, newText) {
    const oldLen = oldText.length
    const newLen = newText.length

    // 公共前缀长度：从头逐字比
    let start = 0
    while (start < oldLen && start < newLen && oldText[start] === newText[start]) start++

    // 公共后缀长度：从尾逐字比，不能越过前缀边界
    let suffix = 0
    while (
        suffix < oldLen - start &&
        suffix < newLen - start &&
        oldText[oldLen - 1 - suffix] === newText[newLen - 1 - suffix]
    ) suffix++

    // 中间区间被替换：旧文本 [start, oldLen-suffix) 换成新文本 [start, newLen-suffix)
    const del = oldLen - suffix - start
    // 插入内容：新文本 [start, newLen-suffix),slice(start, newLen - suffix) 取出中间区间内容
    const ins = newText.slice(start, newLen - suffix)
    if (del === 0 && ins === '') return null

    return { pos: start, del, ins }
}

// 把操作应用到文本：前缀 + 插入内容 + 删除区间之后的剩余部分
export function applyOp(text, op) {
    if (!op) return text
    return text.slice(0, op.pos) + op.ins + text.slice(op.pos + op.del)
}

// 并发变换：opA 已在文档中生效，把 opB 的坐标修正为与 opA 结果共存的位置
// 覆盖三种相对位置：区间之后、区间之前、起点落在删除区间内部
export function transform(opA, opB) {
    const aStart = opA.pos
    const aEnd = opA.pos + opA.del
    const delta = opA.ins.length - opA.del
    let pos = opB.pos

    if (pos >= aEnd) {
        // opB 整体在 opA 之后，按净增长量平移
        pos += delta
    } else if (pos <= aStart) {
        // opB 在 opA 之前，只需避开 opA 插入的字符
        pos += opA.ins.length
    } else {
        // opB 起点落在 opA 删除区间内，收敛到插入内容之后，避免写入被删区域
        pos = aStart + opA.ins.length
    }

    return { ...opB, pos }
}
