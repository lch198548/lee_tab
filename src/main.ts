import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'
import './styles/modal-skin.css'

createApp(App).mount('#app')

// PWA:生产环境注册 Service Worker(静态资源离线缓存,/api 不缓存)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
