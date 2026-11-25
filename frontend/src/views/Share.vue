<template>
  <div class="share-page">
    <!-- 加载中 -->
    <div v-if="loading" class="tip">加载中...</div>

    <!-- 加载失败：链接不存在、已过期、文档已删除 -->
    <div v-else-if="errorMsg" class="tip">{{ errorMsg }}</div>

    <!-- 正常内容区 -->
    <div v-else class="wrap">
      <div class="top-bar">
        <h3 class="doc-name">{{ docName }}</h3>

        <!-- 权限标识：1 只读 2 可编辑，来自后端 permission 字段 -->
        <el-tag :type="permission === 2 ? 'success' : 'info'" size="small">
          {{ permission === 2 ? '可编辑' : '只读' }}
        </el-tag>

        <el-button
          size="small"
          :type="drawMode ? 'warning' : 'default'"
          @click="toggle(docView.view)"
        >
          {{ drawMode ? '退出批注' : '批注' }}
        </el-button>
        <template v-if="drawMode">
          <el-color-picker v-model="penColor" size="small" />
          <el-input-number v-model="penWidth" :min="1" :max="8" size="small" style="width:90px" />
          <el-button size="small" @click="undo">撤销我的上一笔</el-button>
          <el-button size="small" type="danger" @click="clear">清空批注</el-button>
        </template>

        <!-- 当前视图类型，由文件名后缀决定 -->
        <el-tag type="info" size="small">{{ docView.label }}</el-tag>

        <!-- 当前身份，访客可点改名，让在线列表里始终是可辨识的真人名字 -->
        <span class="identity">身份：{{ displayName }}</span>
        <el-button v-if="isGuest" link size="small" @click="renameGuest">改名</el-button>

        <!-- 只有 Markdown 才给编辑 / 预览切换 -->
        <el-radio-group v-if="docView.view === 'markdown'" v-model="mdMode" size="small">
          <el-radio-button value="edit">编辑</el-radio-button>
          <el-radio-button value="preview">预览</el-radio-button>
        </el-radio-group>

        <!-- 只有可编辑权限才显示保存按钮 -->
        <el-button v-if="permission === 2" type="primary" size="small" @click="handleSave">保存</el-button>

        <!-- 退出：主动离开房间再断开，避免在线列表残留 -->
        <el-button size="small" @click="handleExit">退出</el-button>

        <span class="save-tip">{{ saveTip }}</span>
      </div>

      <!-- 同房间在线成员，名字来自 joinDoc 传入的昵称 -->
      <div class="online-list">
        <span>在线：</span>
        <span v-for="u in onlineUsers" :key="u.userId">{{ u.username }}</span>
      </div>

            <!-- 有人在批注时的提示条 -->
      <div v-if="annotators.length" class="annotator-tip">
        {{ annotators.join('、') }} 正在批注
      </div>

      <!-- 渲染区统一包一层相对定位容器，画布绝对定位盖在上面 -->
      <div class="share-area">
        <div v-if="docView.view === 'table' && csvError" class="type-tip">
          无法以表格视图显示：{{ csvError }}。当前按纯文本显示。
        </div>

        <CsvTable
          v-else-if="docView.view === 'table'"
          v-model="content"
          :read-only="permission !== 2"
        />

        <div
          v-else-if="docView.view === 'markdown' && mdMode === 'preview'"
          class="md-preview"
          v-html="mdHtml"
        ></div>

        <!-- 只读权限 / 本端在批注 / 别人在批注，三种情况都锁正文编辑 -->
        <MonacoEditor
          v-else
          v-model="content"
          :language="docView.language"
          :read-only="permission !== 2 || drawMode || lockedByAnnotate"
        />

        <!-- 批注图层：表格视图不显示 -->
        <DrawLayer
          :active="drawMode"
          :strokes="strokes"
          :color="penColor"
          :width="penWidth"
          @stroke="onStroke"
        />
      </div>
    
    </div>

    <!-- 昵称弹窗：未登录访客进入前必须设置，不允许点击遮罩关闭 -->
    <el-dialog
      v-model="showNameDialog"
      title="请输入昵称"
      width="380px"
      :close-on-click-modal="false"
      :show-close="false"
    >
      <el-input
        v-model="nameInput"
        placeholder="例如：张三、产品经理小王"
        maxlength="20"
        show-word-limit
        @keyup.enter="confirmName"
      />
      <template #footer>
        <el-button type="primary" @click="confirmName">进入文档</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '../utils/request'
import MonacoEditor from '../components/MonacoEditor.vue'
import { io } from 'socket.io-client'
// 需要与 Editor.vue 使用同一套差分协议，否则两端收发不匹配
import { diffToOp, applyOp,transform } from '../utils/ot'
import { resolveDocView } from '../utils/docType'
import { marked } from 'marked'
//import { computed } from 'vue'
import CsvTable from '../components/CsvTable.vue'
import { validateCsv } from '../utils/csv'
// 批注相关工具
import DrawLayer from '../components/DrawLayer.vue'
import { useAnnotation } from '../utils/annotation'
// 文本内容净化工具
import DOMPurify from 'dompurify'


const route = useRoute()

// 页面数据状态
const loading = ref(true)      // 首屏加载中
const errorMsg = ref('')       // 加载失败提示
const docName = ref('')        // 文档名
const content = ref('')        // 文档内容
const permission = ref(1)      // 1 只读 2 可编辑
const saveTip = ref('')        // 保存状态提示
const onlineUsers = ref([])    // 同房间在线成员

// 访客身份状态
const guestName = ref('')      // 访客昵称，未登录时作为 username 上报
const showNameDialog = ref(false)
const nameInput = ref('')

// socket 与协同状态
let socket = null
let currentDocId = null
let isRemoteChange = false
let debounceTimer = null

// 本地最近一次已同步的全文，作为差分基准
let lastText = ''

// 本地缓存的未确认操作，用于回执确认
let pendingOps = []
// 本地操作自增序号，给每条操作一个唯一标识
let opSeq = 0

// 操作被拒绝提示条是否已显示
let rejectedTipShown = false

// 当前是否为未登录访客，控制改名按钮显示
const isGuest = computed(() => !localStorage.getItem('userId'))

// 顶栏显示的身份：已登录取账号名，未登录取访客昵称
const displayName = computed(() => {
  const username = localStorage.getItem('username')
  if (username) return username
  return guestName.value || '未设置'
})

// ===== 文档视图类型（分享页只拿得到 name，所以同样按后缀推导）=====
const docView = computed(() => resolveDocView({ name: docName.value }))
// Markdown 的编辑/预览切换；只读访客也能切预览
const mdMode = ref('edit')
// Markdown 渲染结果
const mdHtml = computed(() => {
  if (docView.value.view !== 'markdown') return ''
  // 清染 Markdown 内容前，先净化，防止 XSS 攻击
  return DOMPurify.sanitize(marked.parse(content.value || ''))
})

const csvCheck = computed(() => {
  if (docView.value.view !== 'table') return { ok: true }
  return validateCsv(content.value)
})
const csvError = computed(() => (csvCheck.value.ok ? '' : csvCheck.value.error))

// 批注协同：访客身份必须来自 getGuestInfo，撤销才能对上自己那笔
const annotation = useAnnotation({
  getSocket: () => socket,
  getDocId: () => currentDocId,
  getIdentity: () => getGuestInfo(),
  defaultColor: '#409eff'   // 访客蓝色，与所有者区分
})
const { drawMode, strokes, annotators, penColor, penWidth, lockedByAnnotate, toggle, onStroke, undo, clear } = annotation


// 通过分享码拉取文档基础信息与权限
async function loadShareDoc() {
  try {
    const res = await request.get(`/share/${route.params.code}`)
    if (res.code !== 200) {
      errorMsg.value = res.msg
      loading.value = false
      return
    }
    docName.value = res.data.name
    content.value = res.data.content
    // 初始化差分基线，避免初次进入就被算成插入全文
    lastText = res.data.content || ''
    permission.value = Number(res.data.permission)
    currentDocId = res.data.docId
    loading.value = false

    // 未登录访客先确认昵称，确认后由 confirmName 触发加入房间
    if (ensureGuestName()) {
      initSocket()
    }
  } catch (e) {
    errorMsg.value = '网络异常，请稍后重试'
    loading.value = false
  }
}

// 检查访客昵称：本地已存则直接使用，否则弹窗要求填写
function ensureGuestName() {
  const stored = localStorage.getItem('guest_username')
  if (stored) {
    guestName.value = stored
    return true
  }
  nameInput.value = ''
  showNameDialog.value = true
  return false
}

// 确认昵称：落盘后加入房间；已在房间内改名时先退出再带新名字重进
function confirmName() {
  const name = nameInput.value.trim()
  if (!name) return ElMessage.warning('请输入昵称')
  if (name.length > 20) return ElMessage.warning('昵称最多 20 个字')

  localStorage.setItem('guest_username', name)
  guestName.value = name
  showNameDialog.value = false

  if (socket) {
    // 改名场景：离开旧房间再重新加入，同房间其他人才会看到新名字
    if (currentDocId) socket.emit('leaveDoc', currentDocId)
    socket.emit('joinDoc', { docId: currentDocId, ...getGuestInfo() })
  } else {
    initSocket()
  }
}

// 顶栏改名入口，复用同一个弹窗
function renameGuest() {
  nameInput.value = guestName.value
  showNameDialog.value = true
}

// 组装 socket 上报的身份：登录用户用真实账号，访客用自填昵称
function getGuestInfo() {
  const userId = localStorage.getItem('userId')
  const username = localStorage.getItem('username')
  if (userId) return { userId, username }

  // 访客 userId 按浏览器持久化，保证断线重连、刷新后在线列表按同一人合并
  let guestId = localStorage.getItem('guest_user_id')
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).slice(2, 8)
    localStorage.setItem('guest_user_id', guestId)
  }
  return { userId: guestId, username: guestName.value || '访客' }
}

// 建立 socket 连接，加入文档房间，与所有者处于同一房间才能实时同步
function initSocket() {
  if (socket) return
  // 认证时携带分享码
  const host = window.location.hostname
  socket = io(`http://${host}:8888`,{ auth: { shareCode: route.params.code } })

    // 绑定批注相关的服务端事件
  annotation.attach(socket)
  // 远端内容推送：只读访客也接收，靠标记阻止回广播
  socket.on('remoteOp', (op) => {
    isRemoteChange = true
    let remoteOp = op
    // 对本地缓存的操作进行 transform，合并到远端操作中
    pendingOps.forEach(localOp => {
      remoteOp = transform(localOp,remoteOp)
    })
    // 应用远端操作到本地文本，得到最新文本
    const next = applyOp(content.value, remoteOp)
    lastText = next
    content.value = next //op.content
    setTimeout(() => { isRemoteChange = false }, 0)
  })

  // 在线成员列表：后端整份推送，前端覆盖式更新
  socket.on('userList', (list) => {
    // 按 userId 去重，同一人多端只显示一次
    const seen = new Map()
    list.forEach(u => { if (!seen.has(u.userId)) seen.set(u.userId, u) })
    onlineUsers.value = Array.from(seen.values())
  })

  socket.on('opAck', ({opId}) => {
    console.log("收到确认操作:",opId)
    // 从本地缓存中移除已确认的操作
    pendingOps = pendingOps.filter(op => op.opId !== opId)
  })

    // 入房时下发的房间实时全文，覆盖 HTTP 拉到的旧内容
  socket.on('docState', (text) => {
    if (typeof text !== 'string') return
    if (text === content.value) { lastText = text; return }
    isRemoteChange = true
    content.value = text
    lastText = text
    setTimeout(() => { isRemoteChange = false }, 0)
  })

  socket.on('opRejected', ({ opId }) => {
    pendingOps = pendingOps.filter(op => op.opId !== opId)
    if (rejectedTipShown) return
    rejectedTipShown = true
    ElMessage.warning('当前没有编辑权限，修改未同步')
  })


  socket.emit('joinDoc', { docId: currentDocId, ...getGuestInfo() })
}

// 内容变化：可编辑才广播，只读访客不发送任何操作
watch(content, (val) => {
  if (isRemoteChange) return
  if (!socket || permission.value !== 2) return

  // 计算本次变化的差分操作
  const op = diffToOp(lastText, val)
  // 无论是否产生操作，基线都要跟随当前内容
  lastText = val
  // 没有变更操作，不发送
  
  if (!op) return

  // 生成唯一 opId 并压入队列，等回执后才移除
  const opId = ++opSeq
  pendingOps.push({ opId, op })
  socket.emit('sendOp', {
    docId: currentDocId,
    op,
    opId
  })

  // 防抖自动保存，避免每次按键都写库
  saveTip.value = '正在编辑...'
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { handleSave() }, 1200)
})

// 保存内容：走后端 share/save，权限与过期时间由后端二次校验
async function handleSave() {
  if (permission.value !== 2) return
  saveTip.value = '保存中...'
  const res = await request.put('/share/save', {
    shareCode: route.params.code,
    content: content.value
  })
  if (res.code === 200) {
    saveTip.value = '已保存'
  } else {
    saveTip.value = ''
    ElMessage.error(res.msg)
  }
}

// 主动退出：先退出房间让其他人立即看到下线，再断开连接并跳回首页
function handleExit() {
  annotation.detach()
  if (socket) {
    if (currentDocId) socket.emit('leaveDoc', currentDocId)
    socket.off('remoteOp')
    socket.off('userList')
    socket.off('opAck')
    socket.disconnect()
    socket = null
    pendingOps = []
    opSeq = 0
  }
  window.location.href = '/'
}

// 组件销毁时清理定时器与连接，防止残留在线状态和内存泄漏
onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (socket) {
    if (currentDocId) socket.emit('leaveDoc', currentDocId)
    socket.off('remoteOp')
    socket.off('userList')
    socket.off('opAck')
    socket.disconnect()
    socket = null
    pendingOps = []
    opSeq = 0
  }
})

// 进入页面立即拉取分享文档
loadShareDoc()
</script>

<style scoped>
.share-page {
  padding: 20px;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.doc-name {
  margin: 0;
}

.identity {
  color: #666;
  font-size: 13px;
}

.save-tip {
  color: #666;
  font-size: 13px;
}

.online-list {
  margin-bottom: 12px;
  font-size: 13px;
}

/* 在线成员名字统一蓝色，和编辑页保持视觉一致 */
.online-list span {
  margin: 0 4px;
  color: #409eff;
}

.tip {
  padding: 40px;
  text-align: center;
  color: #666;
}
/* Markdown 预览区：访客只读，白底留白可滚动 */
.md-preview {
  min-height: 500px;
  padding: 20px 24px;
  background: #fff;
  border: 1px solid #ccc;
  box-sizing: border-box;
  overflow: auto;
  line-height: 1.7;
}

/* 表格类型未接入前的提示条 */
.type-tip {
  margin-bottom: 8px;
  font-size: 12px;
  color: #e6a23c;
}
/* 渲染区容器：给画布提供定位基准 */
.share-area {
  position: relative;
}

/* 批注提示条 */
.annotator-tip {
  color: #e6a23c;
  font-size: 13px;
  margin-bottom: 8px;
}

</style>
