import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import './DeviceFrame.css';

export default function DeviceFrame({ children, isDark }) {
  const [isPhoneView, setIsPhoneView] = useState(false);
  const location = useLocation();

  return (
    <div className={`device-layout ${isPhoneView ? 'phone-mode' : 'web-mode'}`} style={{ backgroundColor: isDark ? '#050608' : '#F9FAFB', transition: 'background-color 0.3s' }}>
      
      {/* View Toggle Button - Only on Home Page */}
      {location.pathname === '/' && (
        <div className="view-toggle">
          <button onClick={() => setIsPhoneView(!isPhoneView)} className="btn-primary" style={{
            padding: '8px 16px', 
            borderRadius: '20px', 
            cursor: 'pointer', 
            zIndex: 10000,
            backgroundColor: isDark ? '#3FD6E0' : '#0284C7',
            color: isDark ? '#0B0D12' : '#FFFFFF',
            border: 'none',
            fontWeight: 'bold'
          }}>
            {isPhoneView ? "Switch to Full Website View" : "Showcase in Phone View"}
          </button>
        </div>
      )}

      <div className={`device-container ${isPhoneView ? 'phone-frame' : ''}`}>
        <div className="device-screen">
          {children}
        </div>
      </div>
    </div>
  );
}
