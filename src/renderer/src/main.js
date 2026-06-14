import App from './App.svelte'
import { mount } from 'svelte'
import './app.css'

const app = mount(App, { target: document.getElementById('app') })
document.getElementById('splash')?.remove()

export default app
