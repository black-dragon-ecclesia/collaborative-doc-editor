<template>
  <div class="login-wrap">
    <el-card style="width:420px">
      <h2 style="text-align:center;margin-bottom:24px">协同文档编辑器登录</h2>
      <el-form ref="formRef" :model="form" label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="form.username"></el-input>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password"></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleLogin" style="width:100%">登录</el-button>
        </el-form-item>
        <el-form-item>
          <el-button @click="handleRegister" style="width:100%">注册账号</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import request from '../utils/request'
import { useUserStore } from '../stores/user'

const router = useRouter()
const userStore = useUserStore()

const form = ref({
  username: '',
  password: ''
})

// 登录
const handleLogin = async () => {
  const res = await request.post('/user/login', form.value)
  if(res.code === 200){
    userStore.setUserInfo(res.data)
    ElMessage.success('登录成功')
    router.push('/')
  }else{
    ElMessage.error(res.msg)
  }
}

//注册
const handleRegister = async () => {
  const res = await request.post('/user/register', form.value)
  if(res.code === 200){
    ElMessage.success('注册成功，请登录')
  }else{
    ElMessage.error(res.msg)
  }
}
</script>

<style scoped>
.login-wrap{
  height:100vh;
  display:flex;
  justify-content:center;
  align-items:center;
  background:#f5f7fa;
}
</style>
