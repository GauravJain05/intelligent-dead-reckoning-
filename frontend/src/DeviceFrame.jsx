import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import './DeviceFrame.css';

export default function DeviceFrame({ children }) {
  const [isPhoneView, setIsPhoneView] = useState(false);
  const location = useLocation();

  return (
    <div className={`device-layout ${isPhoneView ? 'phone-mode' : 'web-mode'}`}>
      
      {/* View Toggle Button */}
      <div className="view-toggle">
        <button 
          onClick={() => setIsPhoneView(!isPhoneView)} 
          className="pill-toggle-btn"
          title="Toggle view mode"
        >
          <span className="toggle-icon">{isPhoneView ? '🖥️' : '📱'}</span>
          <span>{isPhoneView ? "Switch to Full Website View" : "Showcase in Phone View"}</span>
        </button>
      </div>

      <div className={`device-container ${isPhoneView ? 'phone-frame' : ''}`}>
        <div 
          className="device-screen"
          {...(isPhoneView ? { 'data-lenis-prevent': true } : {})}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

