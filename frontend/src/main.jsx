import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { API_URL } from './constants.js'

// Intercept all fetch calls to inject the auth token and handle 401s globally
const _fetch = window.fetch.bind(window)
window.fetch = async (url, options = {}) => {
  const token = localStorage.getItem('authToken')
  if (token && typeof url === 'string' && url.startsWith(API_URL)) {
    options = {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    }
  }
  const response = await _fetch(url, options)
  if (response.status === 401 && typeof url === 'string' && url.startsWith(API_URL)) {
    localStorage.removeItem('authToken')
    window.dispatchEvent(new CustomEvent('auth:logout'))
  }
  return response
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
