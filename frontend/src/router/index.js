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
    },
    {
        // 分享访问页，访客无需登录
        path: '/share/:code',
        name: 'Share',
        component: () => import('../views/Share.vue')
    },
    {
        // 文档编辑页
        path: '/editor/:docId',
        name: 'Editor',
        component: () => import('../views/Editor.vue'),
        meta: { requireAuth: true }
    },
    {
        // 编辑统计页，需登录
        path: '/stats',
        name: 'Stats',
        component: () => import('../views/Stats.vue'),
        meta: { requireAuth: true }
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
