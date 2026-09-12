import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import mockTelemetry from './data/mockTelemetry.json';
import './App.css';

// Spatial conversion constants
const ANCHOR_LAT = 37.3382; // San Jose (landlocked) to prevent water overlap
const ANCHOR_LON = -121.8863;
const METERS_PER_DEG_LAT = 111320.0;
const METERS_PER_DEG_LON = 111320.0 * Math.cos((ANCHOR_LAT * Math.PI) / 180.0);
const DISTANCE_SCALE = 0.25;

let offsetX = 0;
let offsetY = 0;

// Convert local ENU (East-North-Up in meters) to GPS Longitude/Latitude
function enuToLngLat(x, y) {
  const dx = x - offsetX;
  const dy = y - offsetY;
  const lat = ANCHOR_LAT + dy / METERS_PER_DEG_LAT;
  const lng = ANCHOR_LON + dx / METERS_PER_DEG_LON;
  return [lng, lat];
}

export default function App() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const vehicleMarkerRef = useRef(null);

  // Telemetry data & simulation states
  const [telemetryData, setTelemetryData] = useState(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Dynamic telemetry metrics
  const [currentIdx, setCurrentIdx] = useState(0);
  const [cumulativeDist, setCumulativeDist] = useState(0);
  const [currentMode, setCurrentMode] = useState(1); // 1=GNSS, 2=DR Outage, 3=Resync
  const [speedKmh, setSpeedKmh] = useState(0);
  const [errorM, setErrorM] = useState(0);
  const [driftX, setDriftX] = useState(0);
  const [driftY, setDriftY] = useState(0);
  const [blackoutDuration, setBlackoutDuration] = useState(0);
  const [eventLog, setEventLog] = useState([]);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [outageMetrics, setOutageMetrics] = useState(null);

  // Sim animation state reference for tick loop
  const simStateRef = useRef({
    idx: 0,
    dist: 0,
    lastGtPt: null,
    isRunning: false,
    playbackSpeed: 1,
    outageFrames: 0,
    outageStartDist: 0,
    outageCompleted: false,
  });

  const addLogMsg = (msg, type = 'normal') => {
    setEventLog((prev) => [
      { id: Date.now() + Math.random(), msg, type, time: new Date().toLocaleTimeString() },
      ...prev.slice(0, 49),
    ]);
  };

  // 1. Initialize MapLibre GL Map with CartoDB Dark Matter style
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = new MapLibreMap({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#1a1a24' // Dark dashboard background
            }
          }
        ]
      },
      center: [ANCHOR_LON, ANCHOR_LAT],
      zoom: 15,
      attributionControl: false,
    });

    // Custom vehicle marker DOM element
    const el = document.createElement('div');
    el.className = 'vehicle-marker-pulse';
    el.style.width = '14px';
    el.style.height = '14px';
    el.style.backgroundColor = '#ef4444';
    el.style.borderRadius = '50%';
    el.style.border = '2px solid #ffffff';
    el.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.8)';

    const vehicleMarker = new Marker({ element: el }).setLngLat([ANCHOR_LON, ANCHOR_LAT]).addTo(map);
    vehicleMarkerRef.current = vehicleMarker;

    map.on('load', () => {
      // GeoJSON Sources
      const emptyGeoJSON = { type: 'FeatureCollection', features: [] };
      
      map.addSource('gnss-path', {
        type: 'geojson',
        data: emptyGeoJSON,
      });
      map.addSource('gt-blackout-path', {
        type: 'geojson',
        data: emptyGeoJSON,
      });
      map.addSource('dr-estimate-path', {
        type: 'geojson',
        data: emptyGeoJSON,
      });

      // Map Layers with STRICT requested colors:
      // 1. Ground-Truth Blackout Path (Dashed Slate #566171)
      map.addLayer({
        id: 'gt-blackout-line',
        type: 'line',
        source: 'gt-blackout-path',
        paint: {
          'line-color': '#566171',
          'line-width': 3,
          'line-dasharray': [3, 3],
        },
      });

      // 2. GNSS Tracked Path (Solid Green #228a56)
      map.addLayer({
        id: 'gnss-line',
        type: 'line',
        source: 'gnss-path',
        paint: {
          'line-color': '#228a56',
          'line-width': 4,
        },
      });

      // 3. AI DR Estimate Path (Solid Red #ef4444)
      map.addLayer({
        id: 'dr-estimate-line',
        type: 'line',
        source: 'dr-estimate-path',
        paint: {
          'line-color': '#ef4444',
          'line-width': 4,
        },
      });
    });

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // 2. Fetch Telemetry Data with Fallback
  useEffect(() => {
    const loadTelemetry = async () => {
      addLogMsg('INITIALIZING TELEMETRY CONNECTION...', 'normal');
      try {
        const res = await fetch('http://localhost:8000/telemetry');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTelemetryData(data);
        setIsUsingFallback(false);
        addLogMsg('CONNECTED TO FASTAPI BACKEND. TELEMETRY LOADED.', 'success');
        setupMapBounds(data);
      } catch (err) {
        console.warn('Backend API unavailable. Using fallback JSON dataset:', err);
        setTelemetryData(mockTelemetry);
        setIsUsingFallback(true);
        addLogMsg('BACKEND OFFLINE. LOADED STATIC TELEMETRY FALLBACK FIXTURE.', 'warning');
        setupMapBounds(mockTelemetry);
      }
    };

    loadTelemetry();
  }, []);

  const setupMapBounds = (data) => {
    if (!mapInstance.current || !data?.points?.length) return;
    
    // Sync the map offset to the first point of the trajectory
    // so it renders accurately over land instead of arbitrary coordinates.
    offsetX = data.points[0].gt_x;
    offsetY = data.points[0].gt_y;

    const allCoords = data.points.map((p) => enuToLngLat(p.gt_x, p.gt_y));
    const minLng = Math.min(...allCoords.map((c) => c[0]));
    const minLat = Math.min(...allCoords.map((c) => c[1]));
    const maxLng = Math.max(...allCoords.map((c) => c[0]));
    const maxLat = Math.max(...allCoords.map((c) => c[1]));

    mapInstance.current.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, animate: false }
    );
  };

  // Sync state refs
  useEffect(() => {
    simStateRef.current.isRunning = isRunning;
  }, [isRunning]);

  useEffect(() => {
    simStateRef.current.playbackSpeed = playbackSpeed;
  }, [playbackSpeed]);

  // 3. Render Map Paths up to current index
  const updateMapPaths = (idx, data) => {
    if (!data || !mapInstance.current) return;
    const currentPoints = data.points.slice(0, idx + 1);

    // Group paths by operational mode
    const gnssCoords = [];
    const gtBlackoutCoords = [];
    const drEstimateCoords = [];

    currentPoints.forEach((pt, i) => {
      const gtCoord = enuToLngLat(pt.gt_x, pt.gt_y);
      const predCoord = enuToLngLat(pt.pred_x, pt.pred_y);

      // To prevent gaps when switching modes, we can optionally include the previous point
      const prevPt = i > 0 ? currentPoints[i - 1] : null;
      const prevGtCoord = prevPt ? enuToLngLat(prevPt.gt_x, prevPt.gt_y) : null;
      const prevPredCoord = prevPt ? enuToLngLat(prevPt.pred_x, prevPt.pred_y) : null;

      if (pt.mode === 1) {
        if (prevPt && prevPt.mode !== 1) gnssCoords.push(prevGtCoord);
        gnssCoords.push(gtCoord);
      } else if (pt.mode === 2) {
        if (prevPt && prevPt.mode !== 2) {
          gtBlackoutCoords.push(prevGtCoord);
          drEstimateCoords.push(prevGtCoord); // DR estimate branches off from last GT point
        }
        gtBlackoutCoords.push(gtCoord);
        drEstimateCoords.push(predCoord);
      } else if (pt.mode === 3) {
        if (prevPt && prevPt.mode !== 3) {
          gnssCoords.push(prevGtCoord);
          drEstimateCoords.push(prevPredCoord);
        }
        gnssCoords.push(gtCoord);
        drEstimateCoords.push(predCoord);
      }
    });

    const getLineStringData = (coords) => {
      if (coords.length < 2) return { type: 'FeatureCollection', features: [] };
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      };
    };

    if (mapInstance.current.getSource('gnss-path')) {
      mapInstance.current.getSource('gnss-path').setData(getLineStringData(gnssCoords));
    }
    if (mapInstance.current.getSource('gt-blackout-path')) {
      mapInstance.current.getSource('gt-blackout-path').setData(getLineStringData(gtBlackoutCoords));
    }
    if (mapInstance.current.getSource('dr-estimate-path')) {
      mapInstance.current.getSource('dr-estimate-path').setData(getLineStringData(drEstimateCoords));
    }

    // Move marker to current estimated position
    if (currentPoints.length > 0 && vehicleMarkerRef.current) {
      const lastPt = currentPoints[currentPoints.length - 1];
      const pos = enuToLngLat(lastPt.pred_x, lastPt.pred_y);
      vehicleMarkerRef.current.setLngLat(pos);
    }
  };

  // 4. Animation Frame Loop
  useEffect(() => {
    let animTimer = null;

    const tick = () => {
      if (!simStateRef.current.isRunning || !telemetryData) return;

      let { idx, dist, lastGtPt, playbackSpeed } = simStateRef.current;

      for (let s = 0; s < playbackSpeed; s++) {
        if (idx < telemetryData.points.length - 1) {
          idx++;
          const pt = telemetryData.points[idx];

          if (lastGtPt) {
            const dx = pt.gt_x - lastGtPt.gt_x;
            const dy = pt.gt_y - lastGtPt.gt_y;
            const stepDist = Math.sqrt(dx * dx + dy * dy) * DISTANCE_SCALE;
            dist += stepDist;
            const speed = stepDist * 10 * 3.6; // 10Hz sampling
            setSpeedKmh(speed);
          }
          lastGtPt = pt;

          // Compute drift error
          const dX = (pt.pred_x - pt.gt_x) * DISTANCE_SCALE;
          const dY = (pt.pred_y - pt.gt_y) * DISTANCE_SCALE;
          const err = Math.sqrt(dX * dX + dY * dY);

          setDriftX(dX);
          setDriftY(dY);
          setErrorM(err);
          setCurrentMode(pt.mode);
          setCurrentIdx(idx);
          setCumulativeDist(dist);

          if (pt.mode === 2) {
            if (simStateRef.current.outageFrames === 0) {
              simStateRef.current.outageStartDist = dist;
            }
            simStateRef.current.outageFrames += 1;
            const duration = simStateRef.current.outageFrames * 0.1;
            setBlackoutDuration(duration);
            
            const outageDist = dist - simStateRef.current.outageStartDist;
            const pct = outageDist > 0 ? ((err / outageDist) * 100).toFixed(2) : '0.00';
            setOutageMetrics({
              duration: duration.toFixed(1) + ' s',
              distance: outageDist.toFixed(0) + ' m',
              finalDriftM: err.toFixed(2) + ' m',
              driftPercent: pct + '%',
              status: 'IN PROGRESS'
            });
          } else if (pt.mode === 3 && simStateRef.current.outageFrames > 0 && !simStateRef.current.outageCompleted) {
            simStateRef.current.outageCompleted = true;
            setOutageMetrics((prev) => prev ? { ...prev, status: 'BOUNDED BY IEKF' } : null);
          }

          // Trigger log events on mode transitions
          if (idx === telemetryData.t_start) {
            addLogMsg('⚠️ GNSS SIGNAL DENIED! ENTERING AI DEAD RECKONING MODE.', 'warning');
          } else if (idx === telemetryData.t_end) {
            addLogMsg('✅ GNSS SIGNAL RESTORED. INITIATING STATE RE-FUSION.', 'success');
          }
        } else {
          setIsRunning(false);
          addLogMsg('TELEMETRY SIMULATION COMPLETE.', 'success');
          break;
        }
      }

      simStateRef.current.idx = idx;
      simStateRef.current.dist = dist;
      simStateRef.current.lastGtPt = lastGtPt;

      updateMapPaths(idx, telemetryData);

      if (simStateRef.current.isRunning) {
        animTimer = setTimeout(tick, 100);
      }
    };

    if (isRunning) {
      tick();
    }

    return () => {
      if (animTimer) clearTimeout(animTimer);
    };
  }, [isRunning, telemetryData]);

  // Simulation controls
  const handleTogglePlay = () => {
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    simStateRef.current = {
      idx: 0,
      dist: 0,
      lastGtPt: null,
      isRunning: false,
      playbackSpeed: playbackSpeed,
      outageFrames: 0,
      outageStartDist: 0,
      outageCompleted: false,
    };
    setCurrentIdx(0);
    setCumulativeDist(0);
    setSpeedKmh(0);
    setErrorM(0);
    setDriftX(0);
    setDriftY(0);
    setBlackoutDuration(0);
    setCurrentMode(1);
    setOutageMetrics(null);
    addLogMsg('SIMULATION RESET TO FRAME 0.', 'normal');
    if (telemetryData) updateMapPaths(0, telemetryData);
  };

  // Helper mode formatters
  const getModeBadge = (mode) => {
    switch (mode) {
      case 2:
        return <span className="mode-badge red-badge">DR OUTAGE MODE</span>;
      case 3:
        return <span className="mode-badge blue-badge">SIGNAL RESYNCING</span>;
      case 1:
      default:
        return <span className="mode-badge green-badge">GNSS AVAILABLE</span>;
    }
  };

  const driftPercent = cumulativeDist > 0 ? ((errorM / cumulativeDist) * 100).toFixed(2) : '0.00';

  return (
    <div className="dashboard-container">
      {/* Top Control Header */}
      <header className="dashboard-header">
        <div className="dash-brand">
          <Link to="/" className="back-link">
            ← Home
          </Link>
          <h1 className="dash-title">Telemetry Control Center</h1>
          {getModeBadge(currentMode)}
          {isUsingFallback && (
            <span className="fallback-tag" title="Backend offline - using static JSON data">
              Offline Mock Data
            </span>
          )}
        </div>

        <div className="dash-controls">
          <button onClick={handleTogglePlay} className="control-btn primary-btn">
            {isRunning ? '⏸ Pause' : '▶ Play Replay'}
          </button>
          <button onClick={handleReset} className="control-btn secondary-btn">
            ↺ Reset
          </button>
          <div className="speed-selector">
            <span className="speed-label">Speed:</span>
            {[1, 2, 5].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`speed-btn ${playbackSpeed === spd ? 'active' : ''}`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Grid: Left Map + Right Telemetry Panel */}
      <div className="dashboard-grid">
        {/* Interactive Map Box with data-lenis-prevent */}
        <div className="map-card-wrapper level-1">
          <div ref={mapRef} data-lenis-prevent className="map-viewport" />

          {/* Floating Map Overlay Legend */}
          <div className="map-overlay-legend">
            <div className="legend-row">
              <span className="dot-indicator green-dot" />
              <span>GNSS Tracked Path (#228a56)</span>
            </div>
            <div className="legend-row">
              <span className="dot-indicator slate-dashed-dot" />
              <span>Ground-Truth Blackout (#566171)</span>
            </div>
            <div className="legend-row">
              <span className="dot-indicator red-dot" />
              <span>AI DR Estimate (#ef4444)</span>
            </div>
          </div>
        </div>

        {/* Right Metrics Panel */}
        <aside className="metrics-panel">
          {/* Flat Level-1 Metric Summary Card */}
          <div className="stack-card level-1 metric-summary-card">
            <h3 className="panel-title">System Status & Metrics</h3>

            <div className="metric-rows">
              <div className="metric-item">
                <span className="lbl">Operational Mode</span>
                <span className="val">{getModeBadge(currentMode)}</span>
              </div>

              <div className="metric-item">
                <span className="lbl">Blackout Duration</span>
                <span className="val highlight-red">{blackoutDuration.toFixed(1)} s</span>
              </div>

              <div className="metric-item">
                <span className="lbl">Cumulative Distance</span>
                <span className="val">{(cumulativeDist / 1000).toFixed(2)} km ({cumulativeDist.toFixed(0)} m)</span>
              </div>

              <div className="metric-item">
                <span className="lbl">Vehicle Speed</span>
                <span className="val">{speedKmh.toFixed(1)} km/h</span>
              </div>

              <div className="metric-item">
                <span className="lbl">Final Position Error</span>
                <span className="val highlight-blue">{errorM.toFixed(2)} m</span>
              </div>

              <div className="metric-item">
                <span className="lbl">Accumulated Drift</span>
                <span className="val highlight-blue">{driftPercent} %</span>
              </div>

              <div className="metric-item">
                <span className="lbl">Delta X / Y Drift</span>
                <span className="val mono-font">
                  ΔX: {driftX.toFixed(2)}m | ΔY: {driftY.toFixed(2)}m
                </span>
              </div>
            </div>

            <button onClick={() => setShowEventsModal(true)} className="btn-diagnostics">
              🔍 View GPS Outage Diagnostics
            </button>
          </div>

          {/* Terminal Event Log Card */}
          <div className="stack-card level-1 terminal-card">
            <div className="terminal-header">
              <span className="term-title">EVENT LOG TERMINAL</span>
              <span className="term-count">{eventLog.length} events</span>
            </div>
            <div className="terminal-body">
              {eventLog.map((log) => (
                <div key={log.id} className={`log-line ${log.type}`}>
                  <span className="log-time">[{log.time}]</span>
                  <span className="log-msg">{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* GPS Outage Diagnostics Modal */}
      {showEventsModal && (
        <div className="modal-backdrop" onClick={() => setShowEventsModal(false)}>
          <div className="stack-card level-2 modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>GPS Outage Diagnostics Report</h2>
              <button onClick={() => setShowEventsModal(false)} className="close-btn">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <table className="diagnostics-table">
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>Outage Duration</th>
                    <th>Distance Traveled</th>
                    <th>Final DR Drift</th>
                    <th>Drift %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {outageMetrics ? (
                    <tr>
                      <td>OUTAGE-001</td>
                      <td>{outageMetrics.duration}</td>
                      <td>{outageMetrics.distance}</td>
                      <td>{outageMetrics.finalDriftM}</td>
                      <td>{outageMetrics.driftPercent}</td>
                      <td>
                        <span className={`badge-text ${outageMetrics.status === 'IN PROGRESS' ? 'warning' : 'success'}`}>
                          {outageMetrics.status}
                        </span>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '1rem', color: '#888' }}>
                        Waiting for GNSS signal loss event...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
