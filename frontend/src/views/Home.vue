<template>
  <div class="home-container">
    <div class="header">
      <span>欢迎：{{ userStore.username }}</span>
      <el-button @click="router.push('/stats')" type="primary" size="small" style="margin-right:8px;">编辑统计</el-button>
      <el-button @click="logout" type="danger" size="small">退出登录</el-button>
    </div>

    <div class="main">
      <div class="sidebar">
        <div class="op-btn">
          <el-button type="primary" size="small" @click="showCreateFolder = true">新建文件夹</el-button>
          <el-button type="success" size="small" @click="showCreateDoc = true">新建文档</el-button>
        </div>
        <el-tree
          :data="treeData"
          node-key="id"
          default-expand-all
          @node-click="handleNodeClick"
        >
          <template #default="{ node, data }">
            <span class="tree-node">
              <span v-if="data.type === 'folder'">📁</span>
              <span v-if="data.type === 'doc'">📄</span>
              <span>{{ data.label }}</span>
              <span class="node-op">
                <!--文件夹操作-->
                <template v-if="data.type === 'folder'">
                  <el-button link size="small" @click.stop="handleRename(data)">重命名</el-button>
                  <el-button link size="small" type="danger" @click.stop="handleDeleteFolder(data)">删除</el-button>
                </template>
                <!--文档操作【新增】-->
                <template v-if="data.type === 'doc'">
                  <el-button link size="small" @click.stop="handleRenameDoc(data)">重命名</el-button>
                  <el-button link size="small" type="danger" @click.stop="handleDeleteDoc(data)">删除</el-button>
                </template>
              </span>
            </span>
          </template>
        </el-tree>
      </div>
        <div class="content">
        <!-- 欢迎区 -->
        <div class="hero">
          <h2>在线协同文档编辑器</h2>
          <p>多人实时协同 · 差分操作 + OT 冲突合并 · 分享与版本回溯</p>
          <div class="hero-meta">
            <span>文档 {{ docCount }} 篇</span>
            <span>文件夹 {{ folderCount }} 个</span>
            <span>支持 .txt / .md / 代码 / .csv</span>
          </div>
        </div>

        <!-- 功能卡片 -->
        <div class="card-grid">
          <div class="card" v-for="item in features" :key="item.title">
            <span class="card-tag" :style="{ background: item.color }">{{ item.tag }}</span>
            <div class="card-title">{{ item.title }}</div>
            <div class="card-desc">{{ item.desc }}</div>
          </div>
        </div>

        <!-- 快速上手 -->
        <div class="guide">
          <h3>快速上手</h3>
          <ol>
            <li>
              <b>新建文档</b>：点左侧「新建文档」，<u>文件名后缀决定视图</u>——<code>.md</code> 带预览、
              <code>.csv</code> 变表格、<code>.js</code> 等代码后缀自动高亮，无后缀就是纯文本。
            </li>
            <li>
              <b>进入编辑</b>：左侧点文档名进入编辑器，输入停止 1.2 秒后自动保存，刷新页面可恢复草稿。
            </li>
            <li>
              <b>邀请协作</b>：编辑器里点「分享」，选只读/可编辑并设有效期，把链接发给对方，
              双方打开同一页面即可实时同步，右侧上方能看到在线成员。
            </li>
            <li>
              <b>批注讨论</b>：点「批注」进入画布模式，正文暂时锁定，多人在同一页面上圈画，
              撤销只撤自己那一笔，清空对全房间生效。
            </li>
            <li>
              <b>留个版本</b>：改动较大的段落前点「保存快照」，之后在「历史版本」里预览并一键回滚。
            </li>
          </ol>
        </div>

        <!-- 底部小提示 -->
        <div class="tip-row">
          <span>表格视图会校验分隔符数量与引号闭合，不通过时只提示行号，不改动内容</span>
          <span>编辑统计按天聚合插入与删除次数</span>
        </div>
      </div>
    </div>

    <!-- 新建文件夹弹窗 -->
    <el-dialog v-model="showCreateFolder" title="新建文件夹">
      <el-input v-model="folderForm.name" placeholder="文件夹名称"></el-input>
      <template #footer>
        <el-button @click="showCreateFolder = false">取消</el-button>
        <el-button type="primary" @click="createFolder">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新建文档弹窗【新增】 -->
    <el-dialog v-model="showCreateDoc" title="新建文档">
      <el-input v-model="docForm.name" placeholder="文档名称" style="margin-bottom:12px;"></el-input>
      <el-select v-model="docForm.folderId" placeholder="选择存放文件夹" style="width:100%">
        <el-option
          v-for="item in folderOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <template #footer>
        <el-button @click="showCreateDoc = false">取消</el-button>
        <el-button type="primary" @click="createDoc">确定</el-button>
      </template>
    </el-dialog>


    <!-- 重命名弹窗 -->
    <el-dialog v-model="showRenameDialog" title="重命名文件夹">
      <el-input v-model="renameForm.name"></el-input>
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" @click="submitRename">确定</el-button>
      </template>
    </el-dialog>

    <!-- 重命名文档弹窗 -->
    <el-dialog v-model="showDocRename" title="重命名文档">
      <el-input v-model="docRenameForm.name"></el-input>
      <template #footer>
        <el-button @click="showDocRename = false">取消</el-button>
        <el-button type="primary" @click="submitDocRename">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>


<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../stores/user'
import request from '../utils/request'

const router = useRouter()
const userStore = useUserStore()

const treeData = ref([])
// 文件夹弹窗
const showCreateFolder = ref(false)
const folderForm = ref({ name: '', parentId: null })
// 重命名弹窗
const showRenameDialog = ref(false)
const renameForm = ref({ id: null, name: '' })

// ====== 新增：新建文档弹窗 ======
const showCreateDoc = ref(false)
const docForm = ref({ name: '', folderId: 0 })

// 新建文档-文件夹下拉选项
const folderOptions = ref([])

const docCount = ref(0)
const folderCount = ref(0)

// 首页功能卡片
const features = [
  { tag: '协同', title: '实时协同编辑', desc: 'Socket.io 房间 + 差分操作，多端输入不互相覆盖', color: '#409eff' },
  { tag: '分享', title: '文档分享', desc: '只读 / 可编辑两种权限，可设过期时间，无需注册即可打开', color: '#67c23a' },
  { tag: '视图', title: '按后缀切换视图', desc: '纯文本、Markdown、代码高亮、CSV 表格自动识别', color: '#909399' },
  { tag: '批注', title: '共享批注画布', desc: '多人实时共享笔画，批注时锁定正文并提示他人', color: '#e6a23c' },
  { tag: '快照', title: '版本快照', desc: '随时存档与回滚，回滚同样走协同广播', color: '#8e44ad' },
  { tag: '统计', title: '编辑统计', desc: '折线 / 柱状 / 饼图查看编辑趋势与文档热度', color: '#2c9e87' }
]


// 获取全部数据：文件夹 + 文档
async function loadAllData() {
  const [folderRes, docRes] = await Promise.all([
    request.get('/folder/list'),
    request.get('/document/list')
  ])
  const folderList = folderRes.code === 200 ? folderRes.data : []
  const docList = docRes.code === 200 ? docRes.data : []

  treeData.value = buildTree(folderList, docList)

  docCount.value = docList.length
  folderCount.value = folderList.length


  // =====新增：组装下拉选项=====
  folderOptions.value = [
    { label: '根目录', value: 0 },
    ...folderList.map(f => ({ label: f.name, value: f.id }))
  ]
}

/**
 * 扁平文件夹数组 + 扁平文档数组 → el‑tree嵌套树形
 * folder: parent_id 父文件夹id，null代表根
 * doc: folderId 所属文件夹id，null代表根
 */
function buildTree(folders, docs) {
  // 文件夹map
  const folderMap = {}
  folders.forEach(f => {
    folderMap[f.id] = {
      id: f.id,
      label: f.name,
      type: 'folder',
      raw: f,
      children: []
    }
  })

  // 把文档挂载到对应文件夹的children
  docs.forEach(d => {
    const docNode = {
      id: 'doc_' + d.id, // 文档id加前缀避免和文件夹id冲突
      label: d.name,
      type: 'doc',
      raw: d
    }
    if(d.folder_id === null){
      // 根目录文档，后面放到root数组
      folderMap['root_docs'] = folderMap['root_docs'] || []
      folderMap['root_docs'].push(docNode)
    }else if(folderMap[d.folder_id]){
      folderMap[d.folder_id].children.push(docNode)
    }
  })

  const root = []
  // 先处理文件夹父子关系
  folders.forEach(f => {
    const node = folderMap[f.id]
    if(f.parent_id === null){
      root.push(node)
    }else if(folderMap[f.parent_id]){
      folderMap[f.parent_id].children.push(node)
    }
  })
  // 追加根目录的文档
  if(folderMap['root_docs']){
    root.push(...folderMap['root_docs'])
  }
  return root
}

// 新建文件夹
async function createFolder() {
  if (!folderForm.value.name) return ElMessage.warning('请输入文件夹名称')
  const res = await request.post('/folder/create', folderForm.value)
  if (res.code === 200) {
    ElMessage.success('创建成功')
    showCreateFolder.value = false
    folderForm.value.name = ''
    loadAllData()
  } else {
    ElMessage.error(res.msg)
  }
}

// 重命名
const handleRename = (row) => {
  renameForm.value.id = row.raw.id
  renameForm.value.name = row.raw.name
  showRenameDialog.value = true
}
async function submitRename() {
  const res = await request.put('/folder/update', renameForm.value)
  if (res.code === 200) {
    ElMessage.success('修改成功')
    showRenameDialog.value = false
    loadAllData()
  } else {
    ElMessage.error(res.msg)
  }
}

// 删除文件夹
const handleDeleteFolder = async (row) => {
  await ElMessageBox.confirm('确定要删除该文件夹?', '提示', { type: 'warning' })
  const res = await request.delete(`/folder/delete/${row.raw.id}`)
  if (res.code === 200) {
    ElMessage.success('删除成功')
    loadAllData()
  } else {
    ElMessage.error(res.msg)
  }
}

// ==========新增：新建文档==========
const showDocRename = ref(false)
const docRenameForm = ref({ id: null, name: '' })

async function createDoc(){
  if(!docForm.value.name) return ElMessage.warning('文档名称不能为空')
  // 关键转换：0代表根目录，传给后端变成null
  const body = {
    name: docForm.value.name,
    folderId: docForm.value.folderId === 0 ? null : docForm.value.folderId
  }
  const res = await request.post('/document/create', body)
  if(res.code === 200){
    ElMessage.success('文档创建成功')
    showCreateDoc.value = false
    docForm.value.name = ''
    docForm.value.folderId = 0 // 默认选中根目录
    loadAllData()
  }else{
    ElMessage.error(res.msg)
  }
}


// 文档重命名、删除
const handleRenameDoc = (row) => {
  docRenameForm.value.id = row.raw.id
  docRenameForm.value.name = row.raw.name
  showDocRename.value = true
}

async function submitDocRename() {
  const res = await request.put('/document/updateName', docRenameForm.value)
  if(res.code === 200){
    ElMessage.success('文档重命名成功')
    showDocRename.value = false
    loadAllData()
  }else{
    ElMessage.error(res.msg)
  }
}

const handleDeleteDoc = async (row) => {
  await ElMessageBox.confirm('确定要删除该文档？', '提示', { type:'warning' })
  const res = await request.delete(`/document/delete/${row.raw.id}`)
  if(res.code === 200){
    ElMessage.success('删除成功')
    loadAllData()
  }else{
    ElMessage.error(res.msg)
  }
}


// 树节点点击，如果是文档，跳编辑器
function handleNodeClick(node){
  if(node.type === 'doc'){
    const realDocId = node.raw.id
    router.push(`/editor/${realDocId}`)
  }
}



const logout = () => {
  userStore.logout()
  router.push('/login')
}

onMounted(() => {
  loadAllData()
})
</script>


<style scoped>
.home-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f7f8fa; /* 页面整体底色 */
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e4e7ed;
  background: #ffffff; /* 顶部白色 */
}

.main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  border-right: 1px solid #e4e7ed;
  padding: 12px;
  background: #f0f2f5; /* 侧边栏浅灰蓝 */
  overflow: auto;
}

.content {
  flex: 1;
  padding: 16px;
  background: #ffffff; /* 内容区白色 */
  overflow: auto;
}

.op-btn {
  margin-bottom: 12px;
}

.tree-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.node-op {
  display: flex;
  gap: 8px;
}
/* 欢迎区 */
.hero {
  margin-bottom: 24px;
  padding: 20px 24px;
  border-radius: 8px;
  background: linear-gradient(135deg, #f2f6ff 0%, #ffffff 70%);
  border: 1px solid #e8eefc;
}
.hero h2 {
  margin: 0 0 6px;
  font-size: 20px;
  color: #1f2d3d;
}
.hero p {
  margin: 0 0 12px;
  font-size: 13px;
  color: #7a8ba0;
}
.hero-meta {
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: #909399;
}
.hero-meta span {
  padding-left: 8px;
  border-left: 2px solid #dcdfe6;
}
.hero-meta span:first-child {
  border-left: none;
  padding-left: 0;
}

/* 功能卡片 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
.card {
  padding: 14px 16px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
  transition: box-shadow .2s, transform .2s;
}
.card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, .06);
  transform: translateY(-1px);
}
.card-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #fff;
  margin-bottom: 8px;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}
.card-desc {
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

/* 快速上手 */
.guide {
  padding: 16px 20px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafbfc;
  margin-bottom: 12px;
}
.guide h3 {
  margin: 0 0 12px;
  font-size: 15px;
  color: #303133;
}
.guide ol {
  margin: 0;
  padding-left: 20px;
}
.guide li {
  font-size: 13px;
  line-height: 1.9;
  color: #606266;
}
.guide li b {
  color: #303133;
}
.guide code {
  padding: 1px 4px;
  border-radius: 3px;
  background: #f0f2f5;
  font-size: 12px;
  color: #c7254e;
}

/* 底部提示 */
.tip-row {
  display: flex;
  gap: 24px;
  font-size: 12px;
  color: #a8abb2;
}

/* 窄屏兜底：卡片两列 */
@media (max-width: 1200px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

</style>

