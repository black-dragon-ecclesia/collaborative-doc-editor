<template>
  <div class="stats-container">
    <div class="header">
      <div class="left">
        <el-button size="small" @click="goHome">返回首页</el-button>
        <span class="title">编辑统计</span>
      </div>
      <div class="right">
        <el-select v-model="days" size="small" style="width:120px" @change="loadSummary">
          <el-option label="近 7 天" :value="7" />
          <el-option label="近 14 天" :value="14" />
          <el-option label="近 30 天" :value="30" />
        </el-select>
        <el-button size="small" type="primary" @click="loadSummary">刷新</el-button>
      </div>
    </div>

    <!-- 顶部数字卡片 -->
    <div class="cards">
      <div class="card">
        <div class="label">全部编辑次数</div>
        <div class="value">{{ total }}</div>
      </div>
      <div class="card">
        <div class="label">插入次数</div>
        <div class="value insert">{{ pieData[0].value }}</div>
      </div>
      <div class="card">
        <div class="label">删除次数</div>
        <div class="value del">{{ pieData[1].value }}</div>
      </div>
    </div>

    <!-- 图表区：折线 + 柱状上下排，饼图右侧 -->
    <div class="charts">
      <div class="chart-main">
        <div ref="lineRef" class="chart"></div>
        <div ref="barRef" class="chart"></div>
      </div>
      <div class="chart-side">
        <div ref="pieRef" class="chart"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import request from '../utils/request'

const router = useRouter()
const days = ref(7)
const total = ref(0)

// 饼图数据用 reactive，模板里能直接读数
const pieData = reactive([
  { name: '插入', value: 0 },
  { name: '删除', value: 0 }
])

// 三个图表容器引用
const lineRef = ref(null)
const barRef = ref(null)
const pieRef = ref(null)
// 存 echarts 实例，卸载时统一销毁，避免内存泄漏
let lineChart = null
let barChart = null
let pieChart = null

// 拉统计数据并渲染三个图表
async function loadSummary() {
  const res = await request.get('/stats/summary', { params: { days: days.value } })
  if (res.code !== 200) return ElMessage.error(res.msg)

  const { line, bar, pie, total: t } = res.data
  total.value = t
  pieData[0].value = pie[0].value
  pieData[1].value = pie[1].value

  // 折线图：按天走势
  lineChart.setOption({
    title: { text: `近 ${res.data.days} 天编辑次数`, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 24, top: 50, bottom: 40 },
    xAxis: { type: 'category', data: line.labels, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'line',
      smooth: true,
      data: line.counts,
      areaStyle: { opacity: 0.15 },
      itemStyle: { color: '#409eff' }
    }]
  })

  // 柱状图：编辑量前 5 的文档
  barChart.setOption({
    title: { text: '编辑量 Top5 文档', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 24, top: 50, bottom: 60 },
    xAxis: { type: 'category', data: bar.labels, axisLabel: { rotate: 20, fontSize: 11 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: bar.values,
      barMaxWidth: 36,
      itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] }
    }]
  })

  // 饼图：插入 / 删除占比
  pieChart.setOption({
    title: { text: '插入与删除占比', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item', formatter: '{b}: {c} 次 ({d}%)' },
    legend: { bottom: 8 },
    series: [{
      type: 'pie',
      radius: ['40%', '65%'],
      center: ['50%', '48%'],
      data: pieData,
      label: { show: true, formatter: '{d}%' },
      itemStyle: { borderColor: '#fff', borderWidth: 2 }
    }]
  })
}

// 窗口尺寸变化时图表自适应
function handleResize() {
  lineChart && lineChart.resize()
  barChart && barChart.resize()
  pieChart && pieChart.resize()
}

// 返回首页
function goHome() {
  router.push('/')
}

onMounted(() => {
  // 容器已有宽高后再初始化，否则会渲染成 0 尺寸
  lineChart = echarts.init(lineRef.value)
  barChart = echarts.init(barRef.value)
  pieChart = echarts.init(pieRef.value)
  window.addEventListener('resize', handleResize)
  loadSummary()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  lineChart && lineChart.dispose()
  barChart && barChart.dispose()
  pieChart && pieChart.dispose()
})
</script>

<style scoped>
.stats-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
  padding: 12px 16px;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  font-size: 16px;
  font-weight: 600;
}

.right {
  display: flex;
  gap: 8px;
}

.cards {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.card {
  flex: 1;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px 16px;
}

.card .label {
  font-size: 12px;
  color: #909399;
}

.card .value {
  font-size: 24px;
  font-weight: 600;
  margin-top: 6px;
}

.card .value.insert {
  color: #67c23a;
}

.card .value.del {
  color: #f56c6c;
}

.charts {
  flex: 1;
  display: flex;
  gap: 12px;
  min-height: 0;
}

.chart-main {
  flex: 2;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.chart-side {
  flex: 1;
  min-height: 0;
}

.chart {
  flex: 1;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  min-height: 220px;
}
</style>
