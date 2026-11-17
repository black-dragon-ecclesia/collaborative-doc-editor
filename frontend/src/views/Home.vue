<template>
  <div class="home-container">
    <div class="header">
      <span>欢迎：{{ userStore.username }}</span>
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
        <h3>请在左侧点击文档进入编辑</h3>
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

// 获取全部数据：文件夹 + 文档
async function loadAllData() {
  const [folderRes, docRes] = await Promise.all([
    request.get('/folder/list'),
    request.get('/document/list')
  ])
  const folderList = folderRes.code === 200 ? folderRes.data : []
  const docList = docRes.code === 200 ? docRes.data : []

  treeData.value = buildTree(folderList, docList)

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
</style>

