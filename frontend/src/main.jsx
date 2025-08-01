import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import ModernApp from './ModernApp.jsx'
import ShadcnApp from './ShadcnApp.jsx'
import './styles/modern.css'

// 应用选择器组件
const AppSelector = () => {
  const [useNewUI, setUseNewUI] = useState(true);

  return (
    <div>
      {/* UI切换器 */}
      <div style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        zIndex: 9999,
        background: 'white',
        padding: '10px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: '1px solid #e2e8f0'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <input
            type="checkbox"
            checked={useNewUI}
            onChange={(e) => setUseNewUI(e.target.checked)}
          />
          使用新的Shadcn风格UI
        </label>
      </div>

      {/* 渲染对应的应用 */}
      {useNewUI ? <ShadcnApp /> : <ModernApp />}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppSelector />
  </React.StrictMode>,
)
