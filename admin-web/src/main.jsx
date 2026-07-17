import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import App from './App'
import './styles.css'
import '@xyflow/react/dist/style.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={{ token: { colorPrimary: '#4f46e5', borderRadius: 12, fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif' } }}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
