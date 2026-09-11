import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

export default function Home({ isDark, setIsDark }) {
    return (
        <div className={`home-container ${isDark ? 'dark' : 'light'}`}>
            <header className="home-header">
                <div>
                    <h1 className="title-gradient">NavNirantar | IDR</h1>
                    <p className="subtitle">AI/ML-Driven State Estimation Prototype for Smart Mobility</p>
                </div>
                <button 
                    onClick={() => setIsDark(!isDark)}
                    className="theme-toggle"
                >
                    {isDark ? 'Bright Mode' : 'Dark Mode'}
                </button>
            </header>

            <div className="grid-section">
                <div className="card">
                    <h2 className="card-title">The Navigation Challenge</h2>
                    <p className="card-text">
                        Modern navigation relies heavily on Global Navigation Satellite Systems (GNSS) like GPS. 
                        When vehicles enter environments like urban canyons, dense tree canopies, or tunnels, 
                        the GNSS signal becomes severely degraded or denied. This leads to erratic navigation jumps, lost positioning, and dangerous scenarios for autonomous driving systems.
                    </p>
                </div>
                
                <div className="card">
                    <h2 className="card-title">The Telemetry Demo</h2>
                    <p className="card-text">
                        This dashboard replays real-world driving data to demonstrate the <strong>Intelligent Dead Reckoning (IDR)</strong> system in action. 
                        You will watch the simulation seamlessly transition to an AI-powered Invariant Extended Kalman Filter (IEKF) when GPS fails. 
                        By analyzing raw accelerometer and gyroscope data in real-time, the dashboard proves how the AI can accurately track a vehicle's position through total satellite blackouts.
                    </p>
                </div>
            </div>

            <section>
                <h2 className="section-title">Dashboard Features</h2>
                <p className="subtitle section-subtitle">Interact with the simulation to visualize the AI's performance.</p>
                
                <div className="features-list">
                    <div className="feature-item">
                        <div className="feature-title">Live Connection State</div>
                        <div className="feature-desc">Watch the top header to see exactly when the vehicle loses and regains GNSS lock during the simulated route.</div>
                    </div>
                    <div className="feature-item">
                        <div className="feature-title">Trajectory Mapping</div>
                        <div className="feature-desc">The green line shows the ground truth, while the dashed cyan line shows our AI's prediction. Red zones highlight GPS blackouts.</div>
                    </div>
                    <div className="feature-item">
                        <div className="feature-title">Live Telemetry</div>
                        <div className="feature-desc">Monitor live speed, cumulative distance traveled, and the exact physical drift error metric between the AI and reality.</div>
                    </div>
                    <div className="feature-item">
                        <div className="feature-title">Outage Diagnostics</div>
                        <div className="feature-desc">Click "View GPS Outage Events" to review a detailed log of every blackout zone, safety margins, and accumulated drift errors.</div>
                    </div>
                </div>
            </section>

            <div className="cta-container">
                <Link to="/dashboard" className="btn-cta">
                    Launch Live Telemetry Dashboard
                </Link>
            </div>
        </div>
    );
}
