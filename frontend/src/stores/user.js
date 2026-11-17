import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
    state() {
        return {
            token: localStorage.getItem('token') || '',
            userId: null,
            username: ''
        }
    },
    actions: {
        setUserInfo(info) {
            this.token = info.token
            this.username = info.username
            this.userId = info.userId
            localStorage.setItem('token', info.token)
            localStorage.setItem('username', info.username)
            localStorage.setItem('userId', info.userId)
        },
        logout() {
            this.token = ''
            this.username = ''
            this.userId = ''
            localStorage.removeItem('token')
            localStorage.removeItem('username')
            localStorage.removeItem('userId')
        },
        restoreUser() {
            this.token = localStorage.getItem('token') || ''
            this.username = localStorage.getItem('username') || ''
            this.userId = localStorage.getItem('userId') || null
            console.log('restoreUser执行，username=', this.username)
        }
    }
})
