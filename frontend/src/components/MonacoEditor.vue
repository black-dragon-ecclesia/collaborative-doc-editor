<template>
  <div ref="editorContainer" class="monaco-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as monaco from 'monaco-editor'

// v‑model支持
const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'plaintext' // javascript / python / markdown
  },
  theme: {
    type: String,
    default: 'vs' // vs 浅色，vs‑dark 深色
  }
})
const emit = defineEmits(['update:modelValue'])

const editorContainer = ref(null)
let editorInstance = null

// 初始化编辑器
const initEditor = () => {
  if (!editorContainer.value) return
  editorInstance = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: props.language,
    theme: props.theme,
    automaticLayout: true, // 自动适应容器大小
    minimap: { enabled: false }, // 关闭小地图，网页不需要
    fontSize: 14
  })

  // 监听编辑器内容变化，把新内容抛给父组件
  editorInstance.onDidChangeModelContent(() => {
    const newValue = editorInstance.getValue()
    emit('update:modelValue', newValue)
  })
}

// 父组件传入modelValue变化（切换文档），更新编辑器内容
watch(() => props.modelValue, (newVal) => {
  if (editorInstance) {
    const current = editorInstance.getValue()
    if (current !== newVal) {
      editorInstance.setValue(newVal ?? '')
    }
  }
})

onMounted(() => {
  initEditor()
})

// 组件卸载必须销毁实例，防止内存泄漏
onUnmounted(() => {
  if (editorInstance) {
    editorInstance.dispose()
    editorInstance = null
  }
})
</script>

<style scoped>
.monaco-container {
  width: 100%;
  height: 500px;
  border:1px solid #ccc;
}
</style>
