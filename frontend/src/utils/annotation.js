// 批注协同的组合式函数：统一管理笔画状态、批注身份与 socket 收发
// 页面只需要提供"当前 socket、当前文档 id、当前身份"，其余全部由这里负责
import { ref, computed, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

export function useAnnotation(options) {
    // 入参都是函数，便于在 socket 尚未创建、或文档切换后取到最新值
    const { getSocket, getDocId, getIdentity, defaultColor = '#f56c6c' } = options

    const drawMode = ref(false)   // 本端是否在批注
    const strokes = ref([])       // 房间内所有笔画
    const annotators = ref([])    // 正在批注的人名
    const penColor = ref(defaultColor)
    const penWidth = ref(2)

    // 别人在批注时锁住正文编辑（自己批注时不算，因为自己本来就不编辑）
    const lockedByAnnotate = computed(() => annotators.value.length > 0 && !drawMode.value)

    // 已绑定的 socket 实例，避免重复 attach 造成监听叠加
    let boundSocket = null

    // 以下四个回调由服务端事件驱动，改动本地响应式状态
    function onBoardState(list) {
        strokes.value = Array.isArray(list) ? list : []
    }
    function onStrokeAdded(stroke) {
        strokes.value = [...strokes.value, stroke]
    }
    function onBoardCleared() {
        strokes.value = []
    }
    function onAnnotators(names) {
        annotators.value = Array.isArray(names) ? names : []
    }

    // 绑定 socket 监听，页面在 socket 创建成功后调用一次即可
    function attach(socket) {
        if (!socket || socket === boundSocket) return
        detach()
        boundSocket = socket
        socket.on('boardState', onBoardState)
        socket.on('strokeAdded', onStrokeAdded)
        socket.on('boardCleared', onBoardCleared)
        socket.on('annotators', onAnnotators)
    }

    // 解绑监听，页面在退出或卸载时调用，避免热更新叠加
    function detach() {
        if (!boundSocket) return
        boundSocket.off('boardState', onBoardState)
        boundSocket.off('strokeAdded', onStrokeAdded)
        boundSocket.off('boardCleared', onBoardCleared)
        boundSocket.off('annotators', onAnnotators)
        boundSocket = null
    }

    // 切换批注模式并广播状态
    function toggle(view) {
        //if (view === 'table') return ElMessage.warning('表格视图暂不支持批注')
        drawMode.value = !drawMode.value
        const socket = getSocket()
        if (socket) {
            socket.emit('drawMode', {
                docId: getDocId(),
                on: drawMode.value,
                username: getIdentity().username
            })
        }
        if (drawMode.value) ElMessage.info('已进入批注模式，文档内容暂时只读')
    }

    // 画完一笔：补上身份后本地入列并广播
    function onStroke(stroke) {
        const me = getIdentity()
        const full = { ...stroke, userId: me.userId, username: me.username }
        strokes.value = [...strokes.value, full]
        const socket = getSocket()
        if (socket) socket.emit('drawStroke', { docId: getDocId(), stroke: full })
    }

    // 撤销自己最后一笔
    function undo() {
        const socket = getSocket()
        if (!socket) return
        socket.emit('undoStroke', { docId: getDocId(), userId: getIdentity().userId })
    }

    // 清空白板：对全房间生效
    async function clear() {
        await ElMessageBox.confirm('确定清空所有批注？该操作对房间里所有人生效', '提示', { type: 'warning' })
        const socket = getSocket()
        if (socket) socket.emit('clearBoard', { docId: getDocId() })
    }

    // 组件卸载时自动解绑
    onUnmounted(detach)

    return {
        drawMode, strokes, annotators, penColor, penWidth, lockedByAnnotate,
        attach, detach, toggle, onStroke, undo, clear
    }
}
