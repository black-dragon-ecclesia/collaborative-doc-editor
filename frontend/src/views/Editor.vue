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
      <div class="online-list">
        <span>在线：</span>
        <span v-for="u in onlineUsers" :key="u.userId">{{ u.username }}</span>
      </div>
      <span style="margin-left:12px;color:#666">{{ saveTip }}</span>
    </div>
    <div class="title">
      <h2>{{ docInfo.name || '未命名文档' }}</h2>
    </div>
    <MonacoEditor v-model="docContent" />
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




// 获取本地草稿key
function getDraftKey(docId) {
  return `doc_draft_${docId}`
}

// 加载文档：优先后端，后端成功之后，如果存在本地草稿，弹窗询问是否恢复草稿
async function loadDoc(id) {
  const res = await request.get(`/document/${id}`)
  if(res.code === 200) {
    docInfo.value = res.data
    docContent.value = res.data.content
    lastText = res.data.content||''
    saveTip.value = ''

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
      socket = io('http://127.0.0.1:8888')

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

</style>
