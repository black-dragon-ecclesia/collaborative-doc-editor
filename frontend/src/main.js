import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { createPinia } from 'pinia'
import router from './router'
import { useUserStore } from './stores/user'

const app = createApp(App)

app.use(ElementPlus)
app.use(createPinia())
app.use(router)
// 挂载时，从localStorage恢复用户信息
const userStore = useUserStore()
userStore.restoreUser()




app.mount('#app')
