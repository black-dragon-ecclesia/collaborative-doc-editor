<template>
  <!-- 透明画布，盖在编辑器上；批注模式下接管鼠标，编辑模式不拦事件 -->
  <canvas
    ref="canvasRef"
    class="draw-layer"
    :style="{ pointerEvents: active ? 'auto' : 'none', cursor: active ? 'crosshair' : 'default' }"
    @mousedown="onDown"
    @mousemove="onMove"
    @mouseup="onUp"
    @mouseleave="onUp"
  />
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  // 是否处于批注模式：只有批注时才接收鼠标事件
  active: { type: Boolean, default: false },
  // 要渲染的笔画列表（含自己的和远端的），由父组件统一维护
  strokes: { type: Array, default: () => [] },
  // 画笔颜色与粗细
  color: { type: String, default: '#f56c6c' },
  width: { type: Number, default: 2 }
})
const emit = defineEmits(['stroke'])

const canvasRef = ref(null)
let ctx = null
let drawing = false
let currentPoints = []   // 当前这一笔的已采样点（归一化坐标）
let lastPixel = null     // 上一个采样点的像素坐标，用于间距采样

const MIN_DISTANCE = 4   // 相邻采样点最小像素间距，压缩数据量

// 按设备像素比设置画布尺寸，避免高分屏线条发虚
function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  redraw()
}

// 把归一化坐标还原成 CSS 像素坐标
function toPixel(p) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: p.x * rect.width, y: p.y * rect.height }
}

// 画一笔：按点集连成折线
function drawStroke(stroke) {
  if (!ctx || !stroke || !stroke.points || stroke.points.length === 0) return
  ctx.strokeStyle = stroke.color || '#f56c6c'
  ctx.lineWidth = stroke.width || 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  stroke.points.forEach((p, i) => {
    const { x, y } = toPixel(p)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
}

// 全量重绘：清屏后按笔画列表重画
function redraw() {
  const canvas = canvasRef.value
  if (!canvas || !ctx) return
  const rect = canvas.getBoundingClientRect()
  ctx.clearRect(0, 0, rect.width, rect.height)
  props.strokes.forEach(drawStroke)
}

// 按下开始新的一笔
function onDown(e) {
  if (!props.active) return
  drawing = true
  currentPoints = []
  lastPixel = null
  addPoint(e)
}

// 移动时采样：间距小于阈值就丢弃，控制点数
function onMove(e) {
  if (!drawing) return
  addPoint(e)
  // 实时预览：每次移动都重绘全部笔画 + 当前这一笔
  redraw()
  drawStroke({ points: currentPoints, color: props.color, width: props.width })
}

// 抬手结束这一笔，整笔抛出给父组件去广播
function onUp() {
  if (!drawing) return
  drawing = false
  if (currentPoints.length < 2) {
    // 单击没有拖动，画一个点也算一笔
    if (currentPoints.length === 1) {
      emit('stroke', {
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        color: props.color,
        width: props.width,
        points: currentPoints
      })
    }
    currentPoints = []
    return
  }
  emit('stroke', {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    color: props.color,
    width: props.width,
    points: currentPoints
  })
  currentPoints = []
  lastPixel = null
}

// 把一个鼠标位置转成归一化坐标并采样入库
function addPoint(e) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top

  // 间距采样：离上一个点太近就不记
  if (lastPixel) {
    const dx = px - lastPixel.x
    const dy = py - lastPixel.y
    if (Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE) return
  }
  lastPixel = { x: px, y: py }

  // 归一化：不同窗口大小的人也能画在相对相同的位置
  currentPoints.push({
    x: +(px / rect.width).toFixed(4),
    y: +(py / rect.height).toFixed(4)
  })
}

// 笔画列表变化（新增远端笔画、撤销后全量下发）时重绘
watch(() => props.strokes, redraw, { deep: true })

// 窗口尺寸变化时重设画布并重绘，保证坐标比例不变
function handleResize() {
  resizeCanvas()
}

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// 供父组件在清空后手动触发重绘
defineExpose({ redraw })
</script>

<style scoped>
.draw-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
