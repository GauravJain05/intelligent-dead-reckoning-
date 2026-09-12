import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Lenis from 'lenis';
import './Home.css';

export default function Home() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
    });

    lenis.on('scroll', (e) => {
      setScrollY(e.scroll);
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const animId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(animId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="home-wrapper">
      {/* Background Decorative Layer for Parallax */}
      <div 
        className="parallax-bg-layer"
        style={{ transform: `translateY(${scrollY * 0.15}px)` }}
      />

      {/* Top Navbar */}
      <header className="navbar">
        <div className="brand-badge">
          <span className="brand-dot"></span>
          <span className="brand-name">NavNirantar</span>
          <span className="brand-sub">| IDR</span>
        </div>
        <div className="nav-links">
          <a href="#problem" className="nav-link">Overview</a>
          <a href="#features" className="nav-link">Features</a>
          <Link to="/dashboard" className="btn-cta-primary pill-btn">
            Launch Dashboard
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        
        {/* HERO SECTION */}
        <section className="hero-section">
          <div className="hero-badge">
            <span className="badge-pulse"></span>
            sih ps 26168 • intelligent dead reckoning engine
          </div>
          
          <h1 className="hero-headline">
            gnss-denied navigation & <br />
            <span className="text-highlight">ai map-matching engine</span>
          </h1>

          <p className="hero-subtext">
            Continuous high-precision vehicle state estimation in satellite blackout zones.
            Fusing Invariant Extended Kalman Filtering (IEKF), deep neural speed models, and non-holonomic road geometry constraints.
          </p>

          <div className="hero-actions">
            <Link to="/dashboard" className="btn-cta-primary hero-btn">
              Launch Live Dashboard ➔
            </Link>
            <a href="#features" className="btn-cta-outlined hero-btn">
              Explore System Architecture
            </a>
          </div>

          {/* Hero Media Block with Inset Vignette Shadow */}
          <div 
            className="hero-media-block"
            style={{ transform: `translateY(${scrollY * -0.05}px)` }}
          >
            <div className="vignette-overlay" />
            
            <div className="media-preview-content">
              <div className="media-header">
                <div className="status-indicator live">
                  <span className="pulse-dot green"></span>
                  <span>LIVE REPLAY ENGINE</span>
                </div>
                <div className="path-legend">
                  <span className="legend-item"><span className="legend-dot green"></span> GNSS Tracked</span>
                  <span className="legend-item"><span className="legend-dot gray-dashed"></span> Ground Truth</span>
                  <span className="legend-item"><span className="legend-dot red"></span> DR AI Estimate</span>
                </div>
              </div>

              <div className="mock-map-visual">
                <svg viewBox="0 0 800 320" className="mock-map-svg">
                  {/* Road Grid Background Lines */}
                  <path d="M 0 80 Q 200 60 400 120 T 800 100" fill="none" stroke="#2a2e37" strokeWidth="16" />
                  <path d="M 150 0 Q 180 150 220 320" fill="none" stroke="#2a2e37" strokeWidth="12" />
                  <path d="M 500 0 Q 520 180 580 320" fill="none" stroke="#2a2e37" strokeWidth="12" />

                  {/* GNSS Path (Green #228a56) */}
                  <path d="M 50 80 L 220 85 L 300 95" fill="none" stroke="#228a56" strokeWidth="4" strokeLinecap="round" />
                  
                  {/* Ground Truth Blackout Path (Dashed Slate #566171) */}
                  <path d="M 300 95 Q 400 130 520 110" fill="none" stroke="#566171" strokeWidth="3" strokeDasharray="6 4" />
                  
                  {/* DR Estimate Path (Red #ef4444) */}
                  <path d="M 300 95 Q 410 145 520 122" fill="none" stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />

                  {/* Restored GNSS Path (Green #228a56) */}
                  <path d="M 520 110 L 650 105 L 750 98" fill="none" stroke="#228a56" strokeWidth="4" strokeLinecap="round" />

                  {/* Blackout Zone Box Marker */}
                  <rect x="290" y="55" width="240" height="100" rx="12" fill="rgba(239, 68, 68, 0.08)" stroke="rgba(239, 68, 68, 0.3)" strokeDasharray="4 4" />
                  <text x="310" y="76" fill="#ef4444" fontSize="11" fontFamily="DM Sans" fontWeight="700">TUNNEL BLACKOUT ZONE (60s)</text>

                  {/* Vehicle Marker */}
                  <circle cx="450" cy="132" r="7" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
                </svg>

                <div className="preview-metrics-bar">
                  <div className="preview-metric">
                    <span className="metric-lbl">CURRENT MODE</span>
                    <span className="metric-val text-red">DR OUTAGE MODE</span>
                  </div>
                  <div className="preview-metric">
                    <span className="metric-lbl">BLACKOUT DURATION</span>
                    <span className="metric-val">60.0s</span>
                  </div>
                  <div className="preview-metric">
                    <span className="metric-lbl">CUMULATIVE DRIFT</span>
                    <span className="metric-val text-blue">2.41m (0.38%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* PROBLEM / SOLUTION SECTION */}
        <section id="problem" className="section-container">
          <div className="section-header">
            <span className="section-tag">NAV NIRANTAR ARCHITECTURE</span>
            <h2 className="section-title">The GNSS-Denied Navigation Challenge</h2>
            <p className="section-desc">
              When ground vehicles enter urban canyons, tunnels, or subterranean parking structures, satellite signals degrade or vanish completely. Traditional GPS systems jump or freeze, creating critical failure points for autonomous mobility.
            </p>
          </div>

          <div className="problem-solution-grid">
            <div className="stack-card level-1">
              <div className="card-icon warning">⚠️</div>
              <h3 className="card-heading">The GPS Failure Mode</h3>
              <p className="card-body">
                Loss of satellite line-of-sight leads to multipath distortion, signal loss, and sudden positioning jumps. Without robust inertial fallback, autonomous vehicles lose lane-level localization within seconds.
              </p>
            </div>

            <div className="stack-card level-1 highlight">
              <div className="card-icon success">🛡️</div>
              <h3 className="card-heading">The Intelligent DR Solution</h3>
              <p className="card-body">
                NavNirantar continuously processes raw IMU accelerations and angular rates through an Invariant Extended Kalman Filter (IEKF), MesNet AI velocity filter, and OpenStreetMap non-holonomic constraints to maintain sub-meter path tracking.
              </p>
            </div>
          </div>
        </section>


        {/* FEATURES GRID SECTION */}
        <section id="features" className="section-container">
          <div className="section-header">
            <span className="section-tag">CORE CAPABILITIES</span>
            <h2 className="section-title">Engineered for Uncompromised Precision</h2>
          </div>

          <div className="features-grid">
            
            <div className="stack-card level-1 feature-card">
              <div className="feature-num">01</div>
              <h3 className="card-heading">Alignment & Calibration</h3>
              <p className="card-body">
                Real-time sensor noise profiling, Zero-Velocity Updates (ZUPT), and automatic accelerometer/gyroscope bias estimation prior to blackout entry.
              </p>
            </div>

            <div className="stack-card level-1 feature-card">
              <div className="feature-num">02</div>
              <h3 className="card-heading">AI Speed Filter</h3>
              <p className="card-body">
                Deep MesNet neural network architecture inferring true 3D vehicle velocity vectors from noisy IMU acceleration profiles to prevent quadratic distance integration drift.
              </p>
            </div>

            <div className="stack-card level-1 feature-card">
              <div className="feature-num">03</div>
              <h3 className="card-heading">Map-Matching Engine</h3>
              <p className="card-body">
                Non-holonomic vehicle motion constraints projected directly onto OpenStreetMap road network geometries, eliminating sideways lateral drift.
              </p>
            </div>

            <div className="stack-card level-1 feature-card">
              <div className="feature-num">04</div>
              <h3 className="card-heading">GNSS + INS Fusion</h3>
              <p className="card-body">
                Invariant Extended Kalman Filter (IEKF) dynamically weighting satellite pseudorange measurements when available and maintaining Lie group state manifold consistency during blackouts.
              </p>
            </div>

            <div className="stack-card level-1 feature-card feature-card-wide">
              <div className="feature-num">05</div>
              <h3 className="card-heading">Seamless Signal Handoff</h3>
              <p className="card-body">
                Microsecond smooth state transition from GNSS-tracked mode to DR outage mode and zero-step re-fusion upon satellite lock re-acquisition with complete drift error log telemetry.
              </p>
            </div>

          </div>
        </section>


        {/* BOTTOM CTA BANNER */}
        <section className="section-container cta-section">
          <div className="stack-card level-2 cta-banner">
            <h2 className="cta-title">Experience the Telemetry Replay Engine</h2>
            <p className="cta-subtitle">
              Inspect real-time trajectory curves, compare ground-truth against AI estimations, and evaluate physical drift metrics.
            </p>
            <Link to="/dashboard" className="btn-cta-primary pill-btn banner-btn">
              Launch Live Dashboard ➔
            </Link>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <span>NavNirantar | Intelligent Dead Reckoning Engine</span>
          <span>SIH PS 26168</span>
        </div>
      </footer>
    </div>
  );
}
