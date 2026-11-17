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
        </div>
        <el-tree
          :data="treeData"
          show-icon
          node-key="id"
          default-expand-all
        >
          <template #default="{ node, data }">
            <span class="tree-node">
              <span>{{ data.name }}</span>
              <span class="node-op">
                <el-button link size="small" @click="handleRename(data)">重命名</el-button>
                <el-button link size="small" type="danger" @click="handleDeleteFolder(data)">删除</el-button>
              </span>
            </span>
          </template>
        </el-tree>
      </div>
      <div class="content">
        <h3>文档编辑区域（待开发）</h3>
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

    <!-- 重命名弹窗 -->
    <el-dialog v-model="showRenameDialog" title="重命名文件夹">
      <el-input v-model="renameForm.name"></el-input>
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" @click="submitRename">确定</el-button>
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
const showCreateFolder = ref(false)
const folderForm = ref({ name: '', parentId: null })

const showRenameDialog = ref(false)
const renameForm = ref({ id: null, name: '' })

// 获取文件夹列表
async function getFolderList() {
  const res = await request.get('/folder/list')
  if (res.code === 200) {
    // 简单扁平数据，后面再递归转真正树形
    treeData.value = res.data
  }
}

// 新建文件夹
async function createFolder() {
  if (!folderForm.value.name) return ElMessage.warning('请输入文件夹名称')
  const res = await request.post('/folder/create', folderForm.value)
  if (res.code === 200) {
    ElMessage.success('创建成功')
    showCreateFolder.value = false
    folderForm.value.name = ''
    getFolderList()
  } else {
    ElMessage.error(res.msg)
  }
}

// 重命名
const handleRename = (row) => {
  renameForm.value.id = row.id
  renameForm.value.name = row.name
  showRenameDialog.value = true
}
async function submitRename() {
  const res = await request.put('/folder/update', renameForm.value)
  if (res.code === 200) {
    ElMessage.success('修改成功')
    showRenameDialog.value = false
    getFolderList()
  } else {
    ElMessage.error(res.msg)
  }
}

// 删除文件夹
const handleDeleteFolder = async (row) => {
  await ElMessageBox.confirm('确定要删除该文件夹?', '提示', { type: 'warning' })
  const res = await request.delete(`/folder/delete/${row.id}`)
  if (res.code === 200) {
    ElMessage.success('删除成功')
    getFolderList()
  } else {
    ElMessage.error(res.msg)
  }
}

const logout = () => {
  userStore.logout()
  router.push('/login')
}

onMounted(() => {
  console.log('读取到的username：', userStore.username)
  console.log('localStorage里：', localStorage.getItem('username'))
  getFolderList()
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

