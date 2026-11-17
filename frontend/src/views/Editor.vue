<template>
  <div class="editor-page">
    <h2>文档编辑器 docId：{{ $route.params.docId }}</h2>
    <el-button @click="$router.push('/')">返回目录</el-button>
  </div>
</template>

<script setup>
</script>
<style scoped>
.editor-page{
  padding:20px;
}
</style>
