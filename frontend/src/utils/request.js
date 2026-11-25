import axios from 'axios'
const host = window.location.hostname
const service = axios.create({
    //  baseURL: 'http://127.0.0.1:8888/api'
    baseURL: `http://${host}:8888/api`,
    timeout: 8000
})

// 请求拦截器，自动带上token
service.interceptors.request.use(config => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// 响应拦截，统一处理返回
service.interceptors.response.use(res => {
    return res.data
}, err => {
    return Promise.reject(err)
})

export default service
