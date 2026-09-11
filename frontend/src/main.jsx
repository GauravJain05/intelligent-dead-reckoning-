import React, { useState, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Home from './Home.jsx'
import DeviceFrame from './DeviceFrame.jsx'

function RootApp() {
  const [isDark, setIsDark] = useState(false);
  
  return (
    <BrowserRouter>
      <DeviceFrame isDark={isDark}>
        <Routes>
          <Route path="/" element={<Home isDark={isDark} setIsDark={setIsDark} />} />
          <Route path="/dashboard" element={<App isDark={isDark} />} />
          <Route path="*" element={<Home isDark={isDark} setIsDark={setIsDark} />} />
        </Routes>
      </DeviceFrame>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
