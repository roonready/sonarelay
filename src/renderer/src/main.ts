import { createApp } from 'vue';
import { createPinia } from 'pinia';
import MainView from './views/MainView.vue';
import './style.css';
import { i18n, initializeLanguage } from './i18n';
void initializeLanguage().then(() => { createApp(MainView).use(createPinia()).use(i18n).mount('#app'); });
