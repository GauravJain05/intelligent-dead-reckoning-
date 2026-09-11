import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import './App.css';
const ANCHOR_LAT = 37.7749;
const ANCHOR_LON = -122.4194;
const METERS_PER_DEG_LAT = 111320.0;
const METERS_PER_DEG_LON = 111320.0 * Math.cos(ANCHOR_LAT * Math.PI / 180.0);
const DISTANCE_SCALE = 0.25;

function enuToLngLat(x, y) {
    const lat = ANCHOR_LAT + (y / METERS_PER_DEG_LAT);
    const lng = ANCHOR_LON + (x / METERS_PER_DEG_LON);
    return [lng, lat];
}

function formatTime(frameStr) {
    const totalMs = frameStr * 100;
    const d = new Date(totalMs); 
    return d.toISOString().substring(11, 22); 
}

export default function App({ isDark }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const layersRef = useRef({
        gtPolyline: null,
        fusedPolyline: null,
        blackoutPolyline: null,
        vehicleMarker: null,
        darkTiles: null,
        lightTiles: null
    });
    
    const animationId = useRef(null);
    const [telemetryData, setTelemetryData] = useState(null);
    
    // Simulation states
    const [isRunning, setIsRunning] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    
    // UI states updated frequently
    const [currentIdx, setCurrentIdx] = useState(0);
    const [cumulativeDist, setCumulativeDist] = useState(0);
    const [currentMode, setCurrentMode] = useState(1);
    const [speedKmh, setSpeedKmh] = useState(0);
    const [errorM, setErrorM] = useState(0);
    const [driftX, setDriftX] = useState(0);
    const [driftY, setDriftY] = useState(0);
    const [outageTime, setOutageTime] = useState(0);
    
    // Events
    const [eventLog, setEventLog] = useState([]);
    const [eventsList, setEventsList] = useState([]);
    const [showEventsModal, setShowEventsModal] = useState(false);
    const currentEventRef = useRef(null);
    const eventCountRef = useRef(0);
    
    const simStateRef = useRef({
        idx: 0,
        dist: 0,
        lastGtPt: null,
        mode: 1,
        isRunning: false,
        playbackSpeed: 1
    });

    useEffect(() => {
        if (isDark) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }, [isDark]);
    
    // Initialize map
    useEffect(() => {
        if (!mapRef.current) return;
        if (mapInstance.current) return;
        
        const map = new MapLibreMap({
            container: mapRef.current,
            style: 'https://tiles.openfreemap.org/styles/liberty',
            center: [-122.4194, 37.7749],
            zoom: 15,
            attributionControl: false
        });
        
        const el = document.createElement('div');
        el.className = 'vehicle-marker';
        el.style.width = '12px'; el.style.height = '12px'; 
        el.style.backgroundColor = '#0284C7'; 
        el.style.borderRadius = '50%'; 
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';
        
        const vehicleMarker = new Marker({element: el}).setLngLat([0,0]).addTo(map);

        map.on('load', () => {
            map.addSource('blackout', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
            map.addSource('gt', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
            map.addSource('fused', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } });
            
            map.addLayer({
                id: 'blackout-line', type: 'line', source: 'blackout',
                paint: { 'line-color': '#DC2626', 'line-width': 10, 'line-opacity': 0.3 }
            });
            map.addLayer({
                id: 'gt-line', type: 'line', source: 'gt',
                paint: { 'line-color': '#059669', 'line-width': 3 }
            });
            map.addLayer({
                id: 'fused-line', type: 'line', source: 'fused',
                paint: { 'line-color': '#0284C7', 'line-width': 3, 'line-dasharray': [2, 2] }
            });
        });
        
        mapInstance.current = map;
        layersRef.current = { vehicleMarker, el };
        
        return () => {
            map.remove();
            mapInstance.current = null;
        };
    }, []);
    
    useEffect(() => {
        if (!mapInstance.current) return;
        const { vehicleMarker, el } = layersRef.current;
        if (isDark) {
            if (mapInstance.current.getLayer('fused-line')) {
                mapInstance.current.setPaintProperty('fused-line', 'line-color', '#3FD6E0');
            }
            el.style.backgroundColor = '#3FD6E0';
        } else {
            if (mapInstance.current.getLayer('fused-line')) {
                mapInstance.current.setPaintProperty('fused-line', 'line-color', '#0284C7');
            }
            el.style.backgroundColor = '#0284C7';
        }
    }, [isDark]);
    
    // Load Telemetry
    useEffect(() => {
        const load = async () => {
            addLogMsg('Loading telemetry...', 'normal', 0);
            try {
                const response = await fetch('http://localhost:8000/telemetry');
                const data = await response.json();
                setTelemetryData(data);
                
                const allLatLons = data.points.map(p => enuToLngLat(p.gt_x, p.gt_y));
                // Calculate bounding box [ [minLng, minLat], [maxLng, maxLat] ]
                const minLng = Math.min(...allLatLons.map(p => p[0]));
                const minLat = Math.min(...allLatLons.map(p => p[1]));
                const maxLng = Math.max(...allLatLons.map(p => p[0]));
                const maxLat = Math.max(...allLatLons.map(p => p[1]));
                const bbox = [[minLng, minLat], [maxLng, maxLat]];
                
                const autoFitDiagonal = () => {
                    if (!mapInstance.current) return;
                    // For maplibre, we just pass padding object
                    mapInstance.current.fitBounds(bbox, {padding: {top: 50, bottom: 50, left: 50, right: 50}, animate: false});
                };
                
                autoFitDiagonal();
                window.addEventListener('resize', autoFitDiagonal);
                
                const blackoutPts = data.points.filter(p => p.mode === 2).map(p => enuToLngLat(p.gt_x, p.gt_y));
                if (mapInstance.current.getSource('blackout')) {
                    mapInstance.current.getSource('blackout').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: blackoutPts } });
                } else {
                    mapInstance.current.once('load', () => {
                        mapInstance.current.getSource('blackout').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: blackoutPts } });
                    });
                }
                
                addLogMsg('TELEMETRY DATA LOADED. SYSTEM READY.', 'normal', 0);
                
                return () => window.removeEventListener('resize', autoFitDiagonal);
            } catch (e) {
                addLogMsg('Error loading telemetry.json. Did you run extract_telemetry.py?', 'alert', 0);
                console.error(e);
            }
        };
        load();
    }, []);
    
    const addLogMsg = (msg, type, frameStr) => {
        setEventLog(prev => [{ id: Date.now() + Math.random(), msg, type, frameStr }, ...prev]);
    };
    
    useEffect(() => {
        simStateRef.current.isRunning = isRunning;
    }, [isRunning]);
    
    useEffect(() => {
        simStateRef.current.playbackSpeed = playbackSpeed;
    }, [playbackSpeed]);
    
    const renderMapToCurrentIdx = (idx, data) => {
        if (!data || !mapInstance.current) return;
        const pts = data.points.slice(0, idx + 1);
        const gtLatLons = pts.map(p => enuToLngLat(p.gt_x, p.gt_y));
        const fusedLatLons = pts.map(p => enuToLngLat(p.pred_x, p.pred_y));
        
        if (mapInstance.current.getSource('gt')) {
            mapInstance.current.getSource('gt').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: gtLatLons } });
        }
        if (mapInstance.current.getSource('fused')) {
            mapInstance.current.getSource('fused').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: fusedLatLons } });
        }
        
        if (fusedLatLons.length > 0) {
            layersRef.current.vehicleMarker.setLngLat(fusedLatLons[fusedLatLons.length - 1]);
        }
    };
    
    const tick = () => {
        if (!simStateRef.current.isRunning || !telemetryData) return;
        
        let { idx, dist, lastGtPt, mode, playbackSpeed } = simStateRef.current;
        let didFinish = false;
        
        let newEvents = [];
        let newLogs = [];
        
        for (let s = 0; s < playbackSpeed; s++) {
            if (idx < telemetryData.points.length - 1) {
                idx++;
                const pt = telemetryData.points[idx];
                const ptMode = pt.mode;
                
                // Distance Calc
                if (lastGtPt) {
                    const dx = pt.gt_x - lastGtPt.gt_x;
                    const dy = pt.gt_y - lastGtPt.gt_y;
                    const dt = (pt.frame - lastGtPt.frame) * 0.1;
                    const realDist = Math.sqrt(dx*dx + dy*dy);
                    dist += realDist * DISTANCE_SCALE;
                    const speed = dt > 0 ? (realDist / dt) * 3.6 : 0;
                    setSpeedKmh(speed);
                }
                lastGtPt = pt;
                
                const dX = (pt.pred_x - pt.gt_x) * DISTANCE_SCALE;
                const dY = (pt.pred_y - pt.gt_y) * DISTANCE_SCALE;
                const eM = Math.sqrt(dX*dX + dY*dY);
                setDriftX(dX);
                setDriftY(dY);
                setErrorM(eM);
                
                if (ptMode !== mode) {
                    if (ptMode === 2) {
                        newLogs.push({ msg: 'GNSS LOST — SWITCHING TO INERTIAL MODE', type: 'alert', frameStr: pt.frame });
                        newLogs.push({ msg: 'NHC + ZUPT ACTIVE', type: 'highlight', frameStr: pt.frame + 2 });
                        newLogs.push({ msg: 'AI SPEED (MESNET) ACTIVE', type: 'highlight', frameStr: pt.frame + 5 });
                    } else if (ptMode === 3) {
                        newLogs.push({ msg: 'GNSS REACQUIRED — RESYNCING', type: 'ok', frameStr: pt.frame });
                    }
                    mode = ptMode;
                }
                
                // Outage Event Logic
                if (ptMode === 2 && !currentEventRef.current) {
                    eventCountRef.current++;
                    currentEventRef.current = {
                        id: eventCountRef.current,
                        start_t: pt.frame,
                        start_dist: dist,
                        start_gt: {x: pt.gt_x, y: pt.gt_y},
                        start_pred: {x: pt.pred_x, y: pt.pred_y},
                        active: true
                    };
                    newEvents.push({ ...currentEventRef.current, cur_t: pt.frame, cur_dist: dist, cur_drift: eM });
                } else if (ptMode === 2 && currentEventRef.current) {
                    newEvents.push({ ...currentEventRef.current, cur_t: pt.frame, cur_dist: dist, cur_drift: eM });
                } else if (ptMode !== 2 && currentEventRef.current) {
                    newEvents.push({ ...currentEventRef.current, active: false, cur_t: pt.frame, cur_dist: dist, cur_drift: eM });
                    currentEventRef.current = null;
                }
                
                if (ptMode === 2) setOutageTime((pt.frame - telemetryData.t_start) * 0.1);
                if (ptMode === 3) setOutageTime((telemetryData.t_end - telemetryData.t_start) * 0.1);

            } else {
                simStateRef.current.isRunning = false;
                setIsRunning(false);
                didFinish = true;
                newLogs.push({ msg: 'END OF TELEMETRY', type: 'normal', frameStr: telemetryData.points[idx].frame });
                break;
            }
        }
        
        simStateRef.current = { ...simStateRef.current, idx, dist, lastGtPt, mode };
        setCurrentIdx(idx);
        setCumulativeDist(dist);
        setCurrentMode(mode);
        
        if (newLogs.length > 0) {
            setEventLog(prev => {
                const logs = [...newLogs.map((l, i) => ({ id: Date.now() + i, ...l }))].reverse();
                return [...logs, ...prev];
            });
        }
        
        if (newEvents.length > 0) {
            setEventsList(prev => {
                const copy = [...prev];
                newEvents.forEach(ev => {
                    const idx = copy.findIndex(e => e.id === ev.id);
                    if (idx >= 0) copy[idx] = ev;
                    else copy.push(ev);
                });
                return copy;
            });
        }
        
        renderMapToCurrentIdx(idx, telemetryData);
        
        if (simStateRef.current.isRunning && !didFinish) {
            setTimeout(() => {
                animationId.current = requestAnimationFrame(tick);
            }, 20);
        }
    };
    
    useEffect(() => {
        if (isRunning) {
            animationId.current = requestAnimationFrame(tick);
        } else if (animationId.current) {
            cancelAnimationFrame(animationId.current);
        }
        return () => {
            if (animationId.current) cancelAnimationFrame(animationId.current);
        };
    }, [isRunning]);
    
    const resetSim = () => {
        if (!telemetryData) return;
        setIsRunning(false);
        if (animationId.current) cancelAnimationFrame(animationId.current);
        
        simStateRef.current = {
            idx: 0,
            dist: 0,
            lastGtPt: null,
            mode: 1,
            isRunning: false,
            playbackSpeed
        };
        
        setCurrentIdx(0);
        setCumulativeDist(0);
        setCurrentMode(1);
        setSpeedKmh(0);
        setErrorM(0);
        setDriftX(0);
        setDriftY(0);
        setOutageTime(0);
        
        currentEventRef.current = null;
        eventCountRef.current = 0;
        setEventsList([]);
        setEventLog(prev => prev.filter(l => l.msg.includes('LOADED')));
        
        renderMapToCurrentIdx(0, telemetryData);
    };
    
    const runJudgeDemo = () => {
        resetSim();
        setPlaybackSpeed(1);
        addLogMsg('STARTING JUDGE DEMO RUN...', 'highlight', 0);
        setTimeout(() => setIsRunning(true), 500);
    };

    // UI derivation
    let modeText = 'GNSS: LOCKED';
    let clsGlobal = 'mode-green';
    let clsLocal = 'mode-green-text';
    let filterModeText = 'GNSS LOCK';
    let dotAi = false, dotNhc = false, dotMap = false;
    
    let uncertAlongW = '2%', uncertCrossW = '2%', uncertHeadW = '5%';
    let uncertAlongV = '0.1m', uncertCrossV = '0.1m', uncertHeadV = '0.5°';

    if (telemetryData) {
        const pt = telemetryData.points[currentIdx] || telemetryData.points[0];
        const mode = currentMode;
        
        if (mode === 1) {
            // defaults
        } else if (mode === 2) {
            modeText = 'GNSS: BLACKOUT — IDR ACTIVE';
            clsGlobal = 'mode-red'; clsLocal = 'mode-red-text';
            filterModeText = 'INERTIAL (NHC+ZUPT)';
            dotAi = true; dotNhc = true;
            
            const outFrames = pt.frame - telemetryData.t_start;
            const outFactor = outFrames / (telemetryData.t_end - telemetryData.t_start); 
            uncertAlongW = `${10 + outFactor * 70}%`;
            uncertCrossW = `${5 + outFactor * 50}%`;
            uncertHeadW = `${10 + outFactor * 30}%`;
            uncertAlongV = (0.1 + outFactor * 4.5).toFixed(1) + 'm';
            uncertCrossV = (0.1 + outFactor * 2.1).toFixed(1) + 'm';
            uncertHeadV = (0.5 + outFactor * 1.5).toFixed(1) + '°';
        } else if (mode === 3) {
            modeText = 'GNSS: RECOVERED (RESYNCING)';
            clsGlobal = 'mode-amber'; clsLocal = 'mode-amber-text';
            filterModeText = 'RESYNC';
            
            if (pt.frame > telemetryData.t_end + 30) {
                modeText = 'GNSS: LOCKED';
                clsGlobal = 'mode-green'; clsLocal = 'mode-green-text';
                filterModeText = 'GNSS LOCK';
            } else {
                uncertAlongW = '5%'; uncertCrossW = '5%'; uncertHeadW = '8%';
                uncertAlongV = '0.3m'; uncertCrossV = '0.3m'; uncertHeadV = '0.8°';
            }
        }
    }

    const progressPct = telemetryData ? (telemetryData.points[currentIdx]?.frame / telemetryData.total_frames) * 100 : 0;
    const ratio = cumulativeDist > 0 ? (errorM / cumulativeDist) * 100 : 0;
    const ratioClass = currentIdx >= (telemetryData?.totalPoints - 1) ? (ratio < 10 ? 'good' : 'bad') : '';

    return (
        <div className={`dashboard-body ${isDark ? 'dark-theme' : ''}`}>
            <div className="dashboard-grid">
                {/* HEADER */}
                <header className="top-bar">
                    <div className="header-left">
                        <div className="proj-name">NavNirantar</div>
                        <div className="proj-sub">Telemetry Dashboard</div>
                    </div>
                    <div className="header-center">
                        <div className={`mode-indicator ${clsGlobal}`}>{modeText}</div>
                    </div>
                    <div className="header-right controls">
                        <button className="btn-ctrl" onClick={() => setIsRunning(true)}>Play</button>
                        <button className="btn-ctrl" onClick={() => setIsRunning(false)}>Pause</button>
                        <button className="btn-ctrl" onClick={resetSim}>Reset</button>
                        <select className="speed-select" value={playbackSpeed} onChange={e => setPlaybackSpeed(parseInt(e.target.value, 10))}>
                            <option value="1">1x</option>
                            <option value="2">2x</option>
                            <option value="4">4x</option>
                            <option value="10">10x</option>
                        </select>
                        <button className="btn-primary" onClick={runJudgeDemo}>Run Judge Demo</button>
                    </div>
                </header>

                {/* PROGRESS BAR */}
                <div className="progress-container">
                    <div className="progress-track" id="progress-track">
                        {telemetryData && (
                            <>
                                <div className="blackout-zone" style={{
                                    left: `${(telemetryData.t_start / telemetryData.total_frames) * 100}%`,
                                    width: `${((telemetryData.t_end - telemetryData.t_start) / telemetryData.total_frames) * 100}%`
                                }}></div>
                                <div style={{position: 'absolute', left: `${(telemetryData.t_start / telemetryData.total_frames) * 100}%`, top: '12px', fontSize: '9px', color: '#E5484D', fontWeight: 'bold'}}>LOS</div>
                                <div style={{position: 'absolute', left: `${(telemetryData.t_end / telemetryData.total_frames) * 100}%`, top: '12px', fontSize: '9px', color: '#2ECC71', fontWeight: 'bold', transform: 'translateX(-100%)'}}>RESYNC</div>
                            </>
                        )}
                        <div className="playhead" style={{left: `${progressPct}%`}}></div>
                    </div>
                </div>

                {/* LEFT PANEL */}
                <aside className="left-panel">
                    <div className="panel-card">
                        <div className="card-label">Filter Mode</div>
                        <div className={`card-value large ${clsLocal}`}>{filterModeText}</div>
                        <div className="card-sub">Filter state machine</div>
                    </div>

                    <div className="panel-card">
                        <div className="card-label">Active Corrections</div>
                        <div className="toggle-row"><span className={`dot ${dotAi ? 'active' : ''}`}></span> AI SPEED (MesNet)</div>
                        <div className="toggle-row"><span className={`dot ${dotNhc ? 'active' : ''}`}></span> NHC (Constraint)</div>
                        <div className="toggle-row"><span className={`dot ${dotMap ? 'active' : ''}`}></span> MAP-MATCHING</div>
                    </div>

                    <div className="panel-card">
                        <div className="card-label">Drift Comparison</div>
                        <div className="mono-value"><span>{driftX.toFixed(2)}</span> <span className="unit">m X</span></div>
                        <div className="mono-value"><span>{driftY.toFixed(2)}</span> <span className="unit">m Y</span></div>
                    </div>

                    <div className="panel-card">
                        <div className="card-label">Uncertainty (Simulated)</div>
                        <div className="uncert-row">
                            <div className="uncert-label">ALONG-TRACK</div>
                            <div className="uncert-bar-bg"><div className="uncert-bar" style={{width: uncertAlongW}}></div></div>
                            <div className="uncert-val">{uncertAlongV}</div>
                        </div>
                        <div className="uncert-row">
                            <div className="uncert-label">CROSS-TRACK</div>
                            <div className="uncert-bar-bg"><div className="uncert-bar" style={{width: uncertCrossW}}></div></div>
                            <div className="uncert-val">{uncertCrossV}</div>
                        </div>
                        <div className="uncert-row">
                            <div className="uncert-label">HEADING</div>
                            <div className="uncert-bar-bg"><div className="uncert-bar" style={{width: uncertHeadW}}></div></div>
                            <div className="uncert-val">{uncertHeadV}</div>
                        </div>
                    </div>
                    <div className="panel-card">
                        <button className="btn-primary" style={{width: '100%', padding: '10px'}} onClick={() => setShowEventsModal(true)}>
                            View GPS Outage Events
                        </button>
                    </div>
                </aside>

                {/* CENTER MAP */}
                <main className="center-map">
                    <div id="map" ref={mapRef}></div>
                    <div className="map-overlay">
                        <div className="map-legend">
                            <div className="legend-item"><span className="legend-line gt"></span> Ground Truth</div>
                            <div className="legend-item"><span className="legend-line fused"></span> Fused/IDR Track</div>
                            <div className="legend-item"><span className="legend-box blackout"></span> Blackout Zone</div>
                        </div>
                    </div>
                </main>

                {/* RIGHT PANEL */}
                <aside className="right-panel">
                    <div className="panel-card event-log-card">
                        <div className="card-label">Event Log</div>
                        <div className="event-log">
                            {eventLog.map(log => (
                                <div key={log.id} className="log-entry">
                                    <span className="log-time">{formatTime(log.frameStr)}</span> <span className={`log-msg ${log.type}`}>{log.msg}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="panel-card telemetry-grid">
                        <div className="tel-box">
                            <div className="tel-label">SPEED</div>
                            <div className="tel-val">{speedKmh.toFixed(1)} <span className="tel-unit">km/h</span></div>
                        </div>
                        <div className="tel-box">
                            <div className="tel-label">DISTANCE</div>
                            <div className="tel-val">{cumulativeDist.toFixed(1)} <span className="tel-unit">m</span></div>
                        </div>
                        <div className="tel-box">
                            <div className="tel-label">UPDATE RATE</div>
                            <div className="tel-val">10.0 <span className="tel-unit">Hz</span></div>
                        </div>
                        <div className="tel-box">
                            <div className="tel-label">OUTAGE TIME</div>
                            <div className="tel-val">{outageTime.toFixed(1)} <span className="tel-unit">s</span></div>
                        </div>
                        <div className="tel-box">
                            <div className="tel-label">DRIFT VS TRUTH</div>
                            <div className="tel-val">{errorM.toFixed(2)} <span className="tel-unit">m</span></div>
                        </div>
                        <div className="tel-box">
                            <div className="tel-label">DRIFT RATIO</div>
                            <div className={`tel-val ${ratioClass}`}>{ratio.toFixed(2)} <span className="tel-unit">%</span></div>
                        </div>
                    </div>
                </aside>

                {/* GPS OUTAGE EVENTS */}
                <section className={`events-table-panel ${showEventsModal ? 'active' : ''}`}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                        <div className="card-label" style={{fontSize: '14px', margin: 0}}>GPS Outage Events</div>
                        <button className="btn-ctrl" style={{cursor: 'pointer'}} onClick={() => setShowEventsModal(false)}>Close</button>
                    </div>
                    <table className="events-table">
                        <thead>
                            <tr>
                                <th>Event</th>
                                <th>GPS Lost</th>
                                <th>GPS Restored</th>
                                <th>Duration</th>
                                <th>Distance Traveled</th>
                                <th>Drift (Error / Ratio)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {eventsList.map(ev => {
                                const dur = (ev.cur_t - ev.start_t) * 0.1;
                                const dist = ev.cur_dist - ev.start_dist;
                                const drift = ev.cur_drift;
                                const r = dist > 0 ? (drift / dist) * 100 : 0;
                                let driftClass = 'drift-fail';
                                if (!ev.active) {
                                    if (r < 10) driftClass = 'drift-pass';
                                    else if (r <= 20) driftClass = 'drift-warn';
                                }
                                
                                return (
                                    <tr key={ev.id} className={ev.active ? 'active-event' : ''}>
                                        <td>#{ev.id}</td>
                                        <td>T+{formatTime(ev.start_t - (telemetryData?.t_start || 0))}</td>
                                        <td>{ev.active ? '(live - ongoing)' : 'T+' + formatTime(ev.cur_t - (telemetryData?.t_start || 0))}</td>
                                        <td>{dur.toFixed(1)} s</td>
                                        <td>{dist.toFixed(1)} m</td>
                                        <td className={!ev.active ? driftClass : ''}>{drift.toFixed(1)} m / {r.toFixed(1)}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>

                {/* BOTTOM BAR */}
                <footer className="bottom-bar">
                    <div className="footer-left">Live Telemetry Dashboard — Powered by Real Backend Evaluation Data</div>
                    <div className="footer-right"><Link to="/" className="back-link">← Exit Dashboard</Link></div>
                </footer>
            </div>
        </div>
    );
}
