<template>
  <div class="csv-wrap">
    <div class="csv-toolbar">
      <span class="csv-tip">第一行为表头，最多渲染 {{ MAX_TABLE_ROWS }} 行；不支持增删列</span>
      <div>
        <el-button v-if="!readOnly" size="small" @click="addRow">加一行</el-button>
      </div>
    </div>

    <el-table :data="bodyRows" size="small" border height="520" empty-text="暂无数据">
      <el-table-column type="index" label="#" width="56" />

      <!-- 列由表头动态生成，表头单元格本身也可编辑 -->
      <el-table-column
        v-for="(h, ci) in header"
        :key="ci"
        :label="h || ('列' + (ci + 1))"
        min-width="150"
      >
        <template #header>
          <el-input
            v-model="header[ci]"
            size="small"
            :disabled="readOnly"
            placeholder="列名"
            @change="sync"
          />
        </template>
        <template #default="{ row }">
          <el-input v-model="row[ci]" size="small" :disabled="readOnly" @change="sync" />
        </template>
      </el-table-column>

      <el-table-column v-if="!readOnly" label="操作" width="80" fixed="right">
        <template #default="{ $index }">
          <el-button link type="danger" size="small" @click="removeRow($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { validateCsv, parseCsv, stringifyCsv, MAX_TABLE_ROWS } from '../utils/csv'

const props = defineProps({
  modelValue: { type: String, default: '' },
  // 只读访客用，禁用所有输入与行操作
  readOnly: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const header = ref([])      // 表头，长度即列数
const bodyRows = ref([])    // 数据行，每行是数组
const delimiter = ref(',')  // 当前分隔符，序列化时沿用，避免把 Tab 换成逗号
let lastEmitText = ''       // 记录自己刚发出的文本，防止 watch 回环重复解析

// 从 CSV 文本装载网格：父组件已校验通过才会挂载本组件，这里只做兜底
function loadFromText(text) {
  const check = validateCsv(text || '')
  if (!check.ok) {
    header.value = ['列1', '列2']
    bodyRows.value = []
    return
  }
  delimiter.value = check.delimiter || ','
  const parsed = parseCsv(text || '', delimiter.value)
  header.value = parsed.header.length ? [...parsed.header] : ['列1', '列2']
  bodyRows.value = parsed.body.map(r => [...r])
}

// 父组件传入的文本变化（切换文档、收到远端操作）时重新装载
watch(() => props.modelValue, (val) => {
  if (val === lastEmitText) return // 本组件刚发出的内容，不用再解析
  loadFromText(val)
}, { immediate: true })

// 任一单元格改动后，整表序列化回 CSV 并抛给父组件
// 父组件的 watch 会自动完成差分广播与防抖保存，协议无需改动
function sync() {
  const csv = stringifyCsv([header.value, ...bodyRows.value], delimiter.value)
  lastEmitText = csv
  emit('update:modelValue', csv)
}

// 末尾追加一行空数据
function addRow() {
  if (bodyRows.value.length + 1 >= MAX_TABLE_ROWS) return
  bodyRows.value.push(new Array(header.value.length).fill(''))
  sync()
}

// 删除指定行
function removeRow(index) {
  bodyRows.value.splice(index, 1)
  sync()
}
</script>

<style scoped>
.csv-wrap {
  background: #fff;
  border: 1px solid #ccc;
  padding: 12px;
}

.csv-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.csv-tip {
  font-size: 12px;
  color: #909399;
}
</style>
