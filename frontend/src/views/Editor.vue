<template>
  <div class="editor-page">
    <div class="top-bar">
      <el-button @click="$router.push('/')">← 返回目录</el-button>
      <el-button type="primary" @click="handleSave">保存文档</el-button>
      <!-- 分享入口：生成带权限与有效期的分享链接 -->
      <el-button size="small" @click="openShare">分享</el-button>
      <!-- 保存快照入口 -->
      <el-button size="small" @click="openSnapshotSave">保存快照</el-button>
      <!-- 历史版本入口 -->
      <el-button size="small" @click="openSnapshotList">历史版本</el-button>
      <!-- CSV 视图互转：仅表格类型出现，只切换本端渲染，不改类型与内容 -->
      <el-button
        v-if="docView.view === 'table'"
        size="small"
        @click="csvViewMode = csvViewMode === 'grid' ? 'text' : 'grid'"
      >
        切换为{{ csvViewMode === 'grid' ? '文本' : '表格' }}视图
      </el-button>
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

      <div class="online-list">
        <span>在线：</span>
        <span v-for="u in onlineUsers" :key="u.userId">{{ u.username }}</span>
      </div>
      <span style="margin-left:12px;color:#666">{{ saveTip }}</span>
    </div>
    <div class="title">
      <h2>{{ docInfo.name || '未命名文档' }}</h2>
      <!-- 当前视图类型，纯展示，不可手动切换 -->
      <span class="type-tag">{{ docView.label }}</span>
      <!-- 只有 Markdown 才给编辑 / 预览切换 -->
      <el-radio-group v-if="docView.view === 'markdown'" v-model="mdMode" size="small" class="md-switch">
        <el-radio-button value="edit">编辑</el-radio-button>
        <el-radio-button value="preview">预览</el-radio-button>
      </el-radio-group>
    </div>
    
        <!-- 有人在批注时的提示条 -->
    <div v-if="annotators.length" class="annotator-tip">
      {{ annotators.join('、') }} 正在批注
    </div>

    <!-- 渲染区统一包一层相对定位容器，画布绝对定位盖在上面 -->
    <div class="editor-area">
      <!-- 表格类型但内容不合法：独立提示条，不参与下面的渲染链 -->
      <div v-if="docView.view === 'table' && csvError" class="type-tip">
        无法以表格视图显示：{{ csvError }}。当前按纯文本显示。
      </div>

      <!-- 链的起点：表格且校验通过才挂网格 -->
      <CsvTable
        v-else-if="showGrid"
        v-model="docContent"
        :read-only="drawMode || lockedByAnnotate"
      />

      <!-- Markdown 预览态 -->
      <div
        v-else-if="docView.view === 'markdown' && mdMode === 'preview'"
        class="md-preview"
        v-html="mdHtml"
      ></div>

      <!-- 兜底：普通文本、代码、以及"表格但校验不通过"都走 Monaco -->
      <MonacoEditor
        v-else
        v-model="docContent"
        :language="docView.language"
        :read-only="drawMode || lockedByAnnotate"
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
  <!-- 分享弹窗：选权限、填有效期、生成链接 -->
  <el-dialog v-model="showShare" title="分享文档" width="520px">
    <el-form label-width="90px">
      <el-form-item label="访问权限">
        <el-radio-group v-model="shareForm.permission">
          <el-radio :value="1">只读</el-radio>
          <el-radio :value="2">可编辑</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="有效期">
        <!-- 0 表示永不过期 -->
        <el-input-number v-model="shareForm.expireDays" :min="0" :max="365" />
        <span style="margin-left:8px;color:#999">天，0 表示永久</span>
      </el-form-item>
    </el-form>

    <!-- 生成后的完整访问地址 -->
    <div v-if="shareLink" class="share-link">
      <el-input v-model="shareLink" readonly />
      <el-button type="primary" size="small" @click="copyShareLink">复制</el-button>
    </div>

    <template #footer>
      <el-button @click="showShare = false">关闭</el-button>
      <el-button type="primary" @click="createShareLink">生成链接</el-button>
    </template>
  </el-dialog>
    <!-- 保存快照弹窗 -->
  <el-dialog v-model="showSnapshotSave" title="保存版本快照" width="420px">
      <el-input v-model="snapshotRemark" placeholder="版本备注，例如：完成第一章" />
      <template #footer>
        <el-button @click="showSnapshotSave = false">取消</el-button>
        <el-button type="primary" @click="saveSnapshot">保存</el-button>
      </template>
  </el-dialog>

    <!-- 历史版本弹窗：列表 + 预览 + 回滚 -->
    <el-dialog v-model="showSnapshotList" title="历史版本" width="720px">
      <el-table :data="snapshotList" size="small" height="400" empty-text="暂无版本">
        <el-table-column prop="id" label="版本ID" width="80" />
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column prop="create_time" label="创建时间" width="180" />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="previewSnapshot(row)">预览</el-button>
            <el-button link type="danger" size="small" @click="rollbackSnapshot(row)">回滚</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 版本预览弹窗 -->
    <el-dialog v-model="showSnapshotPreview" title="版本预览" width="760px">
      <pre class="preview-box">{{ previewContent }}</pre>
    </el-dialog>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import request from '../utils/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import MonacoEditor from '../components/MonacoEditor.vue'
import { io } from 'socket.io-client'
import { useUserStore } from '../stores/user'
// 操作差分与应用工具
import { diffToOp, applyOp,transform } from '../utils/ot'
// 文档类型解析工具
import { resolveDocView ,parseExt} from '../utils/docType'
import { computed } from 'vue'
import { marked } from 'marked'
// 表格组件
import CsvTable from '../components/CsvTable.vue'
import { validateCsv } from '../utils/csv'
// 批注相关工具
import { useAnnotation } from '../utils/annotation'
import DrawLayer from '../components/DrawLayer.vue'
// 文本内容净化工具
import DOMPurify from 'dompurify'


const userStore = useUserStore()


const route = useRoute()
const docInfo = ref({})
const docContent = ref('')
const saveTip = ref('')

let debounceTimer = null
// socket实例
let socket = null
// 当前文档id
let currentDocId = null
// 是否是远程操作
let isRemoteChange = false
// 当前房间在线用户列表
const onlineUsers = ref([])
// 本地最近一次已同步的全文，作为下一次差分的基准
let lastText = ''
// 本地已发出但还没收到回执的操作队列，用于远端操作到来时做变换
let pendingOps = []
// 本地操作自增序号，给每条操作一个唯一标识
let opSeq = 0


// ===== 分享相关状态 =====
const showShare = ref(false)           // 分享弹窗开关
const shareForm = ref({ permission: 2, expireDays: 7 }) // 1 只读 2 可编辑
const shareLink = ref('')              // 生成出来的完整地址

// ===== 版本快照相关状态 =====
const showSnapshotSave = ref(false)   // 保存快照弹窗
const snapshotRemark = ref('')        // 版本备注
const showSnapshotList = ref(false)   // 历史版本弹窗
const snapshotList = ref([])          // 版本列表
const showSnapshotPreview = ref(false) // 预览弹窗
const previewContent = ref('')        // 预览内容

// 批注协同：socket、身份、文档 id 都由外部提供，内部统一管理状态
const annotation = useAnnotation({
  getSocket: () => socket,                       // 拿到当前 socket 实例
  getDocId: () => route.params.docId,            // 当前文档 id
  getIdentity: () => ({                         // 所有者用登录态身份
    userId: userStore.userId,
    username: userStore.username || '访客'
  }),
  defaultColor: '#f56c6c'                        // 所有者红色
})
// 解构出模板要用的字段
const { drawMode, strokes, annotators, penColor, penWidth, lockedByAnnotate, toggle, onStroke, undo, clear } = annotation



// 获取本地草稿key
function getDraftKey(docId) {
  return `doc_draft_${docId}`
}

// 加载文档：优先后端，后端成功之后，如果存在本地草稿，弹窗询问是否恢复草稿
async function loadDoc(id) {
  const res = await request.get(`/document/${id}`)
  if(res.code === 200) {
    console.log(res)
    docInfo.value = res.data
    docContent.value = res.data.content
    lastText = res.data.content||''
    saveTip.value = ''
    // 切换到表格视图
    csvViewMode.value = 'grid'

    // 读取本地草稿
    const localDraft = localStorage.getItem(getDraftKey(id))
    if (localDraft && localDraft !== res.data.content) {
      try {
        await ElMessageBox.confirm('检测到此文档有未提交的本地草稿，是否恢复本地草稿？', '提示', {
          confirmButtonText: '恢复草稿',
          cancelButtonText: '使用服务端内容',
          type: 'info'
        })
        docContent.value = localDraft
        //lastText = localDraft
      } catch (e) {
        // 用户取消，什么都不做
      }
    }
  } else {
    ElMessage.error(res.msg)
  }
  // socket 只在首次进入时创建一次，避免重复连接与重复注册监听
  if (!socket) {
      // 建立与后端 8888 端口的 socket 连接
      // 认证时携带 JWT 令牌
      const host = window.location.hostname
      socket = io(`http://${host}:8888`,{ auth: { token: localStorage.getItem('token') } })
      
      // 绑定批注相关的服务端事件
      annotation.attach(socket)
      // 监听远端编辑内容：另一端输入的全文会推到这里
      socket.on('remoteOp', (op) => {
          console.log("收到远端操作:", op)
          //op: 远端操作对象，包含 type、content 等属性
          // 标记本次变化来自远端，阻止 watch 再次广播，防止消息死循环
          isRemoteChange = true
          let remoteOp = op
          // 如果本地有未确认的操作，先做变换，保证远端
          pendingOps.forEach(localOp => {
              remoteOp = transform(localOp,remoteOp)
          })
          // 应用远端操作到本地文本，得到最新文本
          const next = applyOp(docContent.value, remoteOp)
          // 基线跟随最新结果，保证本地下一次差分基于正确文本
          lastText = next
          // 用远端内容覆盖本地编辑器内容
          docContent.value = next //op.content
          // 赋值完成后立刻复位标记，让用户后续手动输入仍能正常广播
          setTimeout(() => { isRemoteChange = false }, 0)
      })

      // 监听房间在线用户列表：由后端在有人加入/离开时整份推送
      socket.on('userList', (list) => {
          // 按 userId 去重，同一账号开多个标签页只显示一次
          const seen = new Map()
          list.forEach(u => { if (!seen.has(u.userId)) seen.set(u.userId, u) })
          // 覆盖式更新在线列表，无需自行增删，避免与后端状态不一致
          onlineUsers.value = Array.from(seen.values())
      })

      // 监听本地操作的回执，收到后从 pendingOps 中移除对应操作
      socket.on('opAck', (data) => {
          //console.log("收到本地操作回执:", data)
          // 根据 opId 从 pendingOps 中移除对应操作
          pendingOps = pendingOps.filter(op => op.opId !== data.opId)
      })
      // 入房时服务端下发的房间实时全文，覆盖 HTTP 拉到的旧内容
      socket.on('docState', (text) => {
          if (typeof text !== 'string') return
          if (text === docContent.value) { lastText = text; return }
          isRemoteChange = true
          docContent.value = text
          lastText = text
          setTimeout(() => { isRemoteChange = false }, 0)
      })

      socket.on('docPermission', ({ canEdit }) => {
        if (!canEdit) ElMessage.error('登录状态已失效或无编辑权限，请重新登录')
      })
      // 监听操作被拒绝事件：收到后从 pendingOps 中移除对应操作
      let rejectedTipShown = false
      socket.on('opRejected', ({ opId }) => {
        pendingOps = pendingOps.filter(op => op.opId !== opId)
        if (rejectedTipShown) return
        rejectedTipShown = true
        ElMessage.warning('当前没有编辑权限，修改未同步')
      })


  }

  // 进入新文档前先退出上一个房间，离开旧房间时会触发后端广播新在线列表
  if (currentDocId) socket.emit('leaveDoc', currentDocId)

  // 记录当前所在文档 id，供离开房间、发送操作时使用
  currentDocId = id

  // 加入当前文档房间，房间号即文档 id；用户信息由前端登录态传入，后端 socket 回调无法访问 req
  socket.emit('joinDoc', {
      docId: id,
      userId: userStore.userId,
      username: userStore.username
  })
}

// 保存到后端 + 同步写入本地草稿
async function handleSave() {
  const currentDocId = route.params.docId
  if(!currentDocId) return

  // 每次保存都写入本地草稿兜底
  localStorage.setItem(getDraftKey(currentDocId), docContent.value)

  saveTip.value = '保存中...'
  const res = await request.put('/document/save', {
    id: currentDocId,
    content: docContent.value
  })
  if(res.code === 200) {
    saveTip.value = '已自动保存'
    // 后端保存成功，可以清除本地草稿（也可以保留，看需求，这里选择保留）
  } else {
    saveTip.value = '保存失败（已存本地草稿）'
    ElMessage.error(res.msg)
  }
}

// 打开分享弹窗，清空上次生成的链接
function openShare() {
  shareLink.value = ''
  showShare.value = true
}

// 生成分享链接：调后端 share/create，拼成访客可直接打开的地址
async function createShareLink() {
  const res = await request.post('/share/create', {
    docId: route.params.docId,
    permission: shareForm.value.permission,
    expireDays: shareForm.value.expireDays
  })
  if (res.code === 200) {
    shareLink.value = `${window.location.origin}/share/${res.data.shareCode}`
    ElMessage.success('分享链接生成成功')
  } else {
    ElMessage.error(res.msg)
  }
}

// 复制链接到剪贴板
async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    ElMessage.success('已复制到剪贴板')
  } catch (e) {
    ElMessage.warning('复制失败，请手动选中复制')
  }
}

// 打开保存快照弹窗，清空备注
function openSnapshotSave() {
    snapshotRemark.value = ''
    showSnapshotSave.value = true
}

// 提交快照：后端取已落库的 content 整份入库
async function saveSnapshot() {
    const res = await request.post('/snapshot/create', {
        docId: route.params.docId,
        remark: snapshotRemark.value
    })
    if (res.code === 200) {
        ElMessage.success('快照保存成功')
        showSnapshotSave.value = false
    } else {
        ElMessage.error(res.msg)
    }
}

// 打开历史版本，进入时拉最新列表
async function openSnapshotList() {
    const res = await request.get(`/snapshot/list/${route.params.docId}`)
    if (res.code === 200) {
        snapshotList.value = res.data
        showSnapshotList.value = true
    } else {
        ElMessage.error(res.msg)
    }
}

// 预览某个版本
async function previewSnapshot(row) {
    const res = await request.get(`/snapshot/detail/${row.id}`)
    if (res.code === 200) {
        previewContent.value = res.data.content
        showSnapshotPreview.value = true
    } else {
        ElMessage.error(res.msg)
    }
}

// 回滚：直接把内容赋给 docContent，由 watch 自动完成差分广播与自动保存
async function rollbackSnapshot(row) {
    await ElMessageBox.confirm(
        `确定回滚到「${row.remark || row.create_time}」这一版？当前内容会被覆盖`,
        '提示',
        { type: 'warning' }
    )
    const res = await request.post('/snapshot/rollback', { snapshotId: row.id })
    if (res.code === 200) {
        // 不设 isRemoteChange：这次赋值要当作本端编辑，让 watch 算出差异并广播给房间其他人
        docContent.value = res.data.content
        saveTip.value = '已回滚'
        ElMessage.success('回滚成功')
        showSnapshotList.value = false
    } else {
        ElMessage.error(res.msg)
    }
}

// ===== 文档视图类型相关状态 =====
// 视图类型完全由文件名后缀决定，这里只是把映射结果算出来
const docView = computed(() => resolveDocView(docInfo.value))
// Markdown 的「编辑 / 预览」切换，只在 .md 时出现
const mdMode = ref('edit')
// Markdown 预览的渲染结果
const mdHtml = computed(() => {
  if (docView.value.view !== 'markdown') return ''
  // 清染 Markdown 内容前，先净化，防止 XSS 攻击
  return DOMPurify.sanitize(marked.parse(docContent.value || ''))
})

// 表格类型的内容校验：不通过就不挂网格，退回纯文本并提示原因
const csvCheck = computed(() => {
  if (docView.value.view !== 'table') return { ok: true }
  return validateCsv(docContent.value)
})
// 校验失败的原因，用于提示条
const csvError = computed(() => (csvCheck.value.ok ? '' : csvCheck.value.error))
// 'grid' 表格视图 / 'text' 文本视图；切到别的文档时重置回 'grid'
const csvViewMode = ref('grid')
// 是否真的挂网格：类型是表格 + 内容合法 + 本端没切到文本
const showGrid = computed(
  () => docView.value.view === 'table' && !csvError.value && csvViewMode.value === 'grid'
)



// 防抖自动保存
// watch(docContent, () => {
//   // 远程来的变更，不发广播、不触发防抖保存
//   if(isRemoteChange) return
//   saveTip.value = '正在编辑...'
//   // 防抖保存
//   if(debounceTimer) clearTimeout(debounceTimer)
//   debounceTimer = setTimeout(()=>{
//     handleSave()
//   },1200)
//   // 发送操作给后端，广播给其他客户端
//   if(socket) {
//     socket.emit('sendOp', {
//       docId: route.params.docId,
//       op: { content: docContent.value }
//     })
//   }
// })
watch(docContent, (val) => {
  //console.log("本地内容变更:", val)
  if (isRemoteChange) return
  // 计算当前变更操作，如 { pos: 12, del: 0, ins: 'a' }
  const op = diffToOp(lastText, val)
  // 无论是否产生操作，基线都要跟随当前内容
  lastText = val
  // 没有变更操作，不发送
  if (!op) return

  saveTip.value = '正在编辑...'
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { handleSave() }, 1200)

  // 生成唯一 opId 并压入队列，等回执后才移除
  const opId = ++opSeq
  pendingOps.push({ opId, op })

  //console.log("发送本地操作:", op,docContent.value)
  if (socket) {
    // 发送操作给后端，广播给其他客户端
    socket.emit('sendOp', {
      docId: route.params.docId,
      op, // 形如 { pos: 12, del: 0, ins: 'a' },
      opId // 本地操作的唯一 id，用于回执确认
    })
  }
})


// 切换文档
watch(() => route.params.docId, (newId) => {
  if(debounceTimer) clearTimeout(debounceTimer)
  saveTip.value = ''
  if(newId) loadDoc(newId)
}, { immediate: true })

// 组件销毁时统一清理，防止内存泄漏与重复监听
onUnmounted(() => {
    // 清掉未执行的自动保存防抖定时器，避免组件已销毁仍发起请求
    if (debounceTimer) clearTimeout(debounceTimer)
    if (socket) {
        // 主动退出当前房间，让同房间其他人立即看到本人下线
        if (currentDocId) socket.emit('leaveDoc', currentDocId)
        // 移除本组件注册的两个监听，避免热更新或重新进入时叠加
        socket.off('remoteOp')
        socket.off('userList')
        socket.off('opAck')
        // 断开连接，释放后端连接资源
        socket.disconnect()
        // 变量置空，下次进入文档重新创建连接
        socket = null
        // 清空本地缓存的未确认操作
        pendingOps = []
        opSeq = 0
    }
})

</script>

<style scoped>
.editor-page{
  padding:20px;
}
.top-bar{
  display:flex;
  align-items:center;
  gap:10px;
  margin-bottom:16px;
}
.title{
  margin-bottom:12px;
}
.online-list span {
  margin: 0 4px;
  color: #409eff;
}
/* 分享链接行：输入框占满，复制按钮固定右侧 */
.share-link {
  display: flex;
  gap: 8px;
  align-items: center;
}
/* 版本预览区：保留换行、等宽字体，超长可滚动 */
.preview-box {
  max-height: 420px;
  overflow: auto;
  background: #f7f8fa;
  padding: 12px;
  margin: 0;
  white-space: pre-wrap;
  font-family: Consolas, monospace;
  font-size: 13px;
}
/* 类型标签：只做展示，告诉用户当前是什么视图 */
.type-tag {
  display: inline-block;
  padding: 1px 8px;
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
}
/* Markdown 编辑 / 预览切换按钮 */
.md-switch {
  margin-left: 12px;
}
/* Markdown 预览区：白底、留白、可滚动 */
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
.editor-area {
  position: relative;
}

/* 批注提示条 */
.annotator-tip {
  color: #e6a23c;
  font-size: 13px;
  margin-bottom: 8px;
}

</style>
