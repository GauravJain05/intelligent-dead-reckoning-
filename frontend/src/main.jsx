import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import Home from './Home.jsx'
import DeviceFrame from './DeviceFrame.jsx'

function RootApp() {
  return (
    <BrowserRouter>
      <DeviceFrame>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<App />} />
          <Route path="*" element={<Home />} />
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

