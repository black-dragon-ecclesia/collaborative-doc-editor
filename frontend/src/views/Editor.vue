<template>
  <div class="editor-page">
    <div class="top-bar">
      <el-button @click="$router.push('/')">← 返回目录</el-button>
      <el-button type="primary" @click="handleSave">保存文档</el-button>
      <span style="margin-left:12px;color:#666">{{ saveTip }}</span>
    </div>
    <div class="title">
      <h2>{{ docInfo.name || '未命名文档' }}</h2>
    </div>
    <MonacoEditor v-model="docContent" />
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import request from '../utils/request'
import { ElMessage, ElMessageBox } from 'element-plus'
import MonacoEditor from '../components/MonacoEditor.vue'

const route = useRoute()
const docInfo = ref({})
const docContent = ref('')
const saveTip = ref('')

let debounceTimer = null

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
      } catch (e) {
        // 用户取消，什么都不做
      }
    }
  } else {
    ElMessage.error(res.msg)
  }
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

// 防抖自动保存
watch(docContent, () => {
  saveTip.value = '正在编辑...'
  if(debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(()=>{
    handleSave()
  },1200)
})

// 切换文档
watch(() => route.params.docId, (newId) => {
  if(debounceTimer) clearTimeout(debounceTimer)
  saveTip.value = ''
  if(newId) loadDoc(newId)
}, { immediate: true })

// 销毁清理定时器
onUnmounted(()=>{
  if(debounceTimer) clearTimeout(debounceTimer)
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
</style>
