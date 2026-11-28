import { createApp } from 'vue';
import { createPinia } from 'pinia';
import MainView from './views/MainView.vue';
import './style.css';
import { i18n, initializeLanguage } from './i18n';
void initializeLanguage().then(() => {
  if (typeof window.bridge?.onLiveState !== 'function') {
    const root = document.querySelector('#app');
    if (!root) return;
    const panel = document.createElement('main');
    panel.className = 'panel';
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = i18n.global.t('app.bridgeUnavailable');
    panel.append(message);
    root.replaceChildren(panel);
    return;
  }
  createApp(MainView).use(createPinia()).use(i18n).mount('#app');
});
