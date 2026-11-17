import { createRouter, createWebHistory } from 'vue-router'

const routes = [
    {
        path: '/login',
        name: 'Login',
        component: () => import('../views/Login.vue')
    },
    {
        path: '/',
        name: 'Home',
        component: () => import('../views/Home.vue'),
        meta: { requireAuth: true } // 需要登录才能访问
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes
})

// 全局路由守卫：未登录拦截跳登录页
router.beforeEach((to, from, next) => {
    const token = localStorage.getItem('token')
    if (to.meta.requireAuth && !token) {
        next('/login')
    } else {
        next()
    }
})

export default router
