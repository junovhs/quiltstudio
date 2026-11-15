import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

// offline support (production only; dev server must stay uncached)
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {});
