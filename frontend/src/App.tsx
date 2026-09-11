import React, { useState, useEffect, useRef } from 'react';
import { Gauge, MapPin, Wrench, ChevronRight, Satellite } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Telemetry type
// Assumption: Telemetry schema has no explicit GNSS-available flag, so we treat 
// the whole playback as "IDR Active" / outage state for screens 2 & 3.
type TelemetryItem = {
  timestamp: number;
  x_pred: number;
  y_pred: number;
  x_gt: number;
  y_gt: number;
  speed_m_s: number;
};

const ArrowIcon = ({ className }: { className?: string }) => (
  <ChevronRight className={cn("text-arrowBlue w-12 h-12", className)} />
);

// Shared Phone Frame component
function PhoneFrame({ children, activeTab, onTabChange }: { children: React.ReactNode, activeTab: number, onTabChange?: (tab: number) => void }) {
  return (
    <div className="bg-bezel rounded-[40px] p-[14px] w-full max-w-[320px] aspect-[9/19.5] relative mx-auto flex flex-col shadow-xl">
      {/* Notch */}
      <div className="absolute top-[14px] left-1/2 -translate-x-1/2 w-[90px] h-[18px] bg-black rounded-b-[10px] z-10" />
      
      {/* Side buttons */}
      <div className="absolute left-[-3px] top-[15%] w-[3px] h-[10%] bg-[#2A2D3A] rounded-l-md" />
      <div className="absolute left-[-3px] top-[28%] w-[3px] h-[15%] bg-[#2A2D3A] rounded-l-md" />
      <div className="absolute right-[-3px] top-[20%] w-[3px] h-[12%] bg-[#2A2D3A] rounded-r-md" />

      {/* Inner Screen */}
      <div className="bg-screenCream rounded-[28px] w-full h-full overflow-hidden flex flex-col relative pt-4 pb-0">
        <div className="flex-1 flex flex-col overflow-y-auto px-[14px]">
          {children}
        </div>

        {/* Bottom Nav */}
        <div className="flex items-center h-[60px] border-t border-navy/10 bg-screenCream mt-auto shrink-0 z-10">
          <button onClick={() => onTabChange?.(1)} className="flex-1 flex flex-col items-center justify-center gap-1 border-r border-navy/10 h-full">
            <Gauge className={cn("w-5 h-5", activeTab === 1 ? "text-navy stroke-[2]" : "text-navyPrimary stroke-[1.5]")} />
            <span className={cn("text-[9px]", activeTab === 1 ? "text-navy font-bold" : "text-navyPrimary")}>Dashboard</span>
          </button>
          <button onClick={() => onTabChange?.(2)} className="flex-1 flex flex-col items-center justify-center gap-1 border-r border-navy/10 h-full">
            <MapPin className={cn("w-5 h-5", activeTab === 2 ? "text-navy stroke-[2]" : "text-navyPrimary stroke-[1.5]")} />
            <span className={cn("text-[9px]", activeTab === 2 ? "text-navy font-bold" : "text-navyPrimary")}>Map</span>
          </button>
          <button onClick={() => onTabChange?.(3)} className="flex-1 flex flex-col items-center justify-center gap-1 h-full">
            <Wrench className={cn("w-5 h-5", activeTab === 3 ? "text-navy stroke-[2]" : "text-navyPrimary stroke-[1.5]")} />
            <span className={cn("text-[9px]", activeTab === 3 ? "text-navy font-bold" : "text-navyPrimary")}>Calibration</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Screen1({ onStart, isSimulating, errorMsg }: { onStart: () => void, isSimulating: boolean, errorMsg?: string }) {
  return (
    <>
      <div className="mt-[8%] text-center font-bold text-[14px] text-navy">
        IDR Navigator - Home
      </div>
      
      <div className="mx-auto mt-4 bg-green rounded-full px-4 py-1 flex items-center justify-center">
        <span className="text-[11px] font-bold text-white whitespace-nowrap">GNSS: AVAILABLE</span>
      </div>

      <div className="mt-8 mx-auto w-[120px] h-[120px] rounded-full border-[2px] border-navy flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-[55%] h-[55%]">
          <g fill="none" stroke="#1F2A44" strokeWidth="3" strokeLinecap="round">
            <path d="M 50 50 Q 75 25 100 50 Q 75 75 50 50" />
            <path d="M 50 50 Q 25 75 0 50 Q 25 25 50 50" />
            <path d="M 50 50 Q 75 75 50 100 Q 25 75 50 50" />
            <path d="M 50 50 Q 25 25 50 0 Q 75 25 50 50" />
          </g>
        </svg>
      </div>

      <div className="mt-8 flex flex-col items-center gap-0">
        <span className="font-bold text-navy text-[12px]">In-Vehicle Alignment:</span>
        <span className="text-navy text-[12px]">P: 2°, R:1°, Y:45°</span>
        <span className="text-[#8A8A94] text-[10px] italic">(Calibrated)</span>
      </div>

      <div className="mt-6 w-[85%] mx-auto">
        <div className="h-3 rounded-full bg-trackGray overflow-hidden">
          <div className="h-full bg-navyPrimary rounded-full w-[90%]"></div>
        </div>
        <div className="text-center mt-1 text-[#8A8A94] text-[10px] italic">(Calibrated)</div>
      </div>

      <div className="mt-auto w-full flex flex-col items-center">
        {errorMsg && (
          <div className="w-[90%] mb-2 text-center text-xs font-bold text-red-600 bg-red-100 py-1 rounded">
            {errorMsg}
          </div>
        )}
        <button
          onClick={onStart}
          disabled={isSimulating}
          className="mb-4 w-[90%] h-11 rounded-full bg-navyPrimary text-white font-bold flex items-center justify-center disabled:opacity-70"
        >
          {isSimulating ? 'Simulating...' : 'Start Navigation'}
        </button>
      </div>
    </>
  );
}

function Screen2({ speed }: { speed: number }) {
  const speedKmh = speed * 3.6;
  // Map 0-120 km/h to 0-270 degrees
  const angle = Math.min(Math.max(0, speedKmh), 120) * (270 / 120);
  const startAngle = -225;
  const currentAngle = startAngle + angle;
  
  // Calculate SVG arc path for speed
  const r = 40;
  const cx = 50;
  const cy = 50;
  
  // Convert polar to cartesian
  const pStart = {
    x: cx + r * Math.cos((startAngle * Math.PI) / 180),
    y: cy + r * Math.sin((startAngle * Math.PI) / 180)
  };
  const pEnd = {
    x: cx + r * Math.cos((currentAngle * Math.PI) / 180),
    y: cy + r * Math.sin((currentAngle * Math.PI) / 180)
  };
  
  const largeArcFlag = angle > 180 ? 1 : 0;
  const arcPath = `M ${pStart.x} ${pStart.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${pEnd.x} ${pEnd.y}`;

  return (
    <>
      <div className="mt-[8%] text-center font-bold text-[14px] text-navy">
        IDR Nav - Trip 4A
      </div>

      <div className="mx-auto mt-4 bg-red rounded-full px-3 py-1.5 w-full flex items-center justify-center">
        <span className="text-[10px] font-bold text-white text-center leading-tight">
          LOST GNSS SIGNAL! Dead Reckoning
        </span>
      </div>

      <div className="mt-8 relative w-[140px] h-[140px] mx-auto">
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
          {/* Background track */}
          <circle cx="50" cy="50" r="40" fill="none" stroke="#D9D9DE" strokeWidth="6" />
          
          {/* Active arc */}
          {angle > 0 && (
            <path d={arcPath} fill="none" stroke="#2B3A55" strokeWidth="8" strokeLinecap="round" />
          )}
          
          {/* Hub */}
          <circle cx="50" cy="50" r="22" fill="#2B3A55" />
          
          {/* Needle */}
          <g transform={`rotate(${currentAngle}, 50, 50)`}>
            <line x1="50" y1="50" x2="80" y2="50" stroke="#F3EEDC" strokeWidth="2" strokeLinecap="round" />
            <circle cx="50" cy="50" r="3" fill="#F3EEDC" />
          </g>
        </svg>
      </div>

      <div className="mt-4 text-center font-bold text-[12px] text-navy">
        AI Speed Filter
      </div>

      <div className="mt-2 text-center text-[12px] text-navy flex flex-col gap-0.5">
        <span>Vel: {speedKmh.toFixed(1)}km/h (AI Est.),</span>
        <span>Acc: 0.5m/s², Vibr: Filtered</span>
      </div>

      <div className="mt-6 border border-navy/20 rounded-lg w-full h-[70px] relative flex flex-col justify-center px-1 py-1">
        <div className="absolute left-1 top-1 text-[8px] text-gray-500">100</div>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] text-gray-500">0</div>
        <div className="absolute left-1 bottom-1 text-[8px] text-gray-500">-40</div>
        
        <svg className="w-full h-full ml-4" viewBox="0 0 100 50" preserveAspectRatio="none">
          {/* Just a wavy mockup line */}
          <path d="M 0 25 Q 10 10 20 25 T 40 25 T 60 25 T 80 25 T 100 25" fill="none" stroke="#000" strokeWidth="1" strokeOpacity="0.8">
             <animate attributeName="d" 
                values="M 0 25 Q 10 10 20 25 T 40 25 T 60 25 T 80 25 T 100 25;
                        M 0 25 Q 10 40 20 25 T 40 25 T 60 25 T 80 25 T 100 25;
                        M 0 25 Q 10 10 20 25 T 40 25 T 60 25 T 80 25 T 100 25"
                dur="0.5s" repeatCount="indefinite" />
          </path>
        </svg>
      </div>
    </>
  );
}

function Screen3({ history }: { history: TelemetryItem[] }) {
  // SVG viewbox range to fit coordinates
  // We'll normalize the positions relative to min/max of GT + Pred over time
  // Default values to prevent NaN when history is empty
  const xVals = history.length > 0 ? history.flatMap(h => [h.x_gt, h.x_pred]) : [0];
  const yVals = history.length > 0 ? history.flatMap(h => [h.y_gt, h.y_pred]) : [0];
  
  const minX = Math.min(...xVals) - 0.001;
  const maxX = Math.max(...xVals) + 0.001;
  const minY = Math.min(...yVals) - 0.001;
  const maxY = Math.max(...yVals) + 0.001;

  const width = maxX - minX;
  const height = maxY - minY;

  const toSvgX = (x: number) => ((x - minX) / width) * 100;
  // Y usually increases downward in SVG, but GPS Y increases upward. We'll invert Y
  const toSvgY = (y: number) => (1 - ((y - minY) / height)) * 100;

  const current = history[history.length - 1];

  return (
    <>
      <div className="mt-[8%] text-center font-bold text-[14px] text-navy">
        IDR Nav - Position
      </div>

      <div className="mx-auto mt-4 bg-red rounded-full px-3 py-1.5 w-full flex items-center justify-center">
        <span className="text-[10px] font-bold text-white text-center leading-tight">
          GNSS: OUTAGE (Tunnel) - IDR Active
        </span>
      </div>

      <div className="mt-4 flex-1 w-full bg-mapBlue rounded-lg overflow-hidden relative border border-navy/10 mb-4">
        {/* Decorative Grid */}
        <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="20" y1="0" x2="30" y2="100" stroke="#fff" strokeWidth="0.5" />
          <line x1="70" y1="0" x2="50" y2="100" stroke="#fff" strokeWidth="0.5" />
          <line x1="0" y1="30" x2="100" y2="40" stroke="#fff" strokeWidth="0.5" />
          <line x1="0" y1="80" x2="100" y2="70" stroke="#fff" strokeWidth="0.5" />
        </svg>

        {/* Tunnel Arch */}
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[60px] h-[30px] bg-tunnelGray rounded-t-[30px] border-b-0 border border-navy/30" />

        {/* S-Curve background road */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M 50 100 C 60 70, 30 50, 50 15" fill="none" stroke="#3A4560" strokeWidth="12" strokeLinecap="round" />
          <path d="M 50 100 C 60 70, 30 50, 50 15" fill="none" stroke="#F3EEDC" strokeWidth="1" strokeDasharray="3,3" strokeLinecap="round" />
        </svg>

        <div className="absolute top-[40%] left-[55%] flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-navy"></div>
          <div className="bg-white/80 rounded px-1 py-0.5 text-[9px] font-bold text-navy shadow-sm whitespace-nowrap">
            Map-Matching
          </div>
        </div>

        <div className="absolute bottom-[5%] left-[50%] flex items-center gap-1">
          <div className="w-4 h-4 border border-navy rounded flex items-center justify-center">
            {/* simple car */}
            <div className="w-2 h-3 bg-navy opacity-50"></div>
          </div>
          <div className="bg-white/80 rounded px-1 py-0.5 text-[9px] font-bold text-navy shadow-sm whitespace-nowrap">
            Tunnel Exit
          </div>
        </div>

        {/* Live Drift visualization */}
        {history.length > 0 && current && (
           <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* GT Path */}
              <polyline 
                points={history.map(h => `${toSvgX(h.x_gt)},${toSvgY(h.y_gt)}`).join(' ')} 
                fill="none" stroke="#5B8DBF" strokeWidth="1.5" strokeDasharray="2,2" 
              />
              {/* Pred Path */}
              <polyline 
                points={history.map(h => `${toSvgX(h.x_pred)},${toSvgY(h.y_pred)}`).join(' ')} 
                fill="none" stroke="#1F2A44" strokeWidth="2" 
              />
              
              {/* GT Marker */}
              <circle cx={toSvgX(current.x_gt)} cy={toSvgY(current.y_gt)} r="2" fill="#5B8DBF" />
              {/* Pred Marker */}
              <circle cx={toSvgX(current.x_pred)} cy={toSvgY(current.y_pred)} r="2.5" fill="#1F2A44" />
           </svg>
        )}
      </div>
    </>
  );
}

function SystemDataFlow() {
  return (
    <div className="mt-16 max-w-5xl mx-auto px-4 pb-20">
      <h2 className="text-center font-bold uppercase text-[22px] text-navy mb-12 relative">
        SYSTEM DATA FLOW
        <div className="absolute right-0 top-0 text-navy/20 hidden md:block">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
            <path d="M12 12L21.5 5.5" />
            <path d="M12 12L21.5 18.5" />
          </svg>
        </div>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_250px_1fr] gap-8 md:gap-16 items-start">
        
        {/* Inputs Column */}
        <div className="flex flex-col gap-6 relative">
          <div className="text-navy font-bold text-lg mb-2">Inputs</div>
          
          <div className="bg-white border border-navy/15 rounded-lg p-4 shadow-sm relative">
             <h3 className="font-bold text-navy text-sm mb-3">RAW SENSOR DATA (IMU)</h3>
             <div className="flex items-center gap-2 mb-2">
               <span className="text-xs w-8">Accel</span>
               <svg className="flex-1 h-6" viewBox="0 0 100 20" preserveAspectRatio="none">
                 <path d="M0 10 Q10 0 20 10 T40 10 T60 10 T80 10 T100 10" fill="none" stroke="#5B8DBF" strokeWidth="2" />
               </svg>
             </div>
             <div className="flex items-center gap-2">
               <span className="text-xs w-8">Gyro</span>
               <svg className="flex-1 h-6" viewBox="0 0 100 20" preserveAspectRatio="none">
                 <path d="M0 10 Q10 20 20 10 T40 10 T60 10 T80 10 T100 10" fill="none" stroke="#3F7D4C" strokeWidth="2" />
               </svg>
             </div>
             {/* Arrow right to center */}
             <div className="hidden md:block absolute right-[-2rem] top-[50%] -translate-y-1/2">
                <ChevronRight className="text-[#A0A0AA]" />
             </div>
          </div>

          <div className="bg-white border border-navy/15 rounded-lg p-4 shadow-sm relative">
             <h3 className="font-bold text-navy text-sm mb-2">GNSS DATA (INTERMITTENT)</h3>
             <p className="text-sm text-navy">Acc: 0.5m/s², Vibr: Filtered</p>
             <div className="hidden md:block absolute right-[-2rem] top-[50%] -translate-y-1/2">
                <ChevronRight className="text-[#A0A0AA]" />
             </div>
          </div>

          <div className="bg-white border border-navy/15 rounded-lg p-4 shadow-sm relative">
             <h3 className="font-bold text-navy text-sm mb-2">GNSS-to-IDR</h3>
             <div className="flex gap-2 items-end mt-2">
                <div className="text-[10px] -rotate-90 origin-bottom-left whitespace-nowrap mb-4">Input</div>
                <svg className="w-full h-12" viewBox="0 0 100 50" preserveAspectRatio="none">
                  <path d="M0 45 C 30 45, 70 5, 100 5" fill="none" stroke="#2B3A55" strokeWidth="2" />
                </svg>
             </div>
             <p className="text-sm text-navy mt-2">Acc: 3.5m/s², Vibr: Filtered</p>
             <div className="hidden md:block absolute right-[-2rem] top-[50%] -translate-y-1/2">
                <ChevronRight className="text-[#A0A0AA]" />
             </div>
          </div>
        </div>

        {/* AI Brain Column */}
        <div className="flex flex-col gap-0 items-center">
          <div className="text-navy font-bold text-lg mb-6 self-start w-full text-center md:text-left">The AI Brain</div>
          
          <div className="w-full bg-cardGray border border-navyPrimary/30 rounded-xl p-4 text-center font-bold text-navy text-sm shadow-sm">
            Alignment
          </div>
          <div className="h-6 w-[2px] bg-[#A0A0AA] relative">
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-[6px] border-l-transparent border-r-transparent border-t-[#A0A0AA]"></div>
          </div>
          
          <div className="w-full bg-cardGray border border-navyPrimary/30 rounded-xl p-4 text-center font-bold text-navy text-sm shadow-sm mt-1">
            Speed/Vibration Filter
          </div>
          <div className="h-6 w-[2px] bg-[#A0A0AA] relative">
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-[6px] border-l-transparent border-r-transparent border-t-[#A0A0AA]"></div>
          </div>

          <div className="w-full bg-cardGray border border-navyPrimary/30 rounded-xl p-4 text-center font-bold text-navy text-sm shadow-sm mt-1">
            Map-Matching & Constraints
          </div>
          <div className="h-6 w-[2px] bg-[#A0A0AA] relative">
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-[6px] border-l-transparent border-r-transparent border-t-[#A0A0AA]"></div>
          </div>

          <div className="w-full bg-cardGray border border-navyPrimary/30 rounded-xl p-4 text-center font-bold text-navy text-sm shadow-sm mt-1">
            GNSS+INS Fusion
          </div>
        </div>

        {/* Outputs Column */}
        <div className="flex flex-col gap-6 relative">
          <div className="text-navy font-bold text-lg mb-2">Outputs</div>

          <div className="flex gap-4">
            <div className="font-bold text-navy text-md">Accurate Position</div>
            <div className="font-bold text-navy text-md">Seamless Switch</div>
          </div>

          <div className="bg-white border border-navy/15 rounded-lg p-4 shadow-sm h-32 flex items-center">
            <svg className="w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
              <path d="M0 40 C 40 40, 60 10, 100 10" fill="none" stroke="#2B3A55" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>

          <div className="bg-white border border-navy/15 rounded-lg p-4 shadow-sm">
             <h3 className="font-bold text-navy text-sm mb-3">Performance Benchmark</h3>
             <ul className="text-sm text-navy space-y-1">
               <li>Drift: &lt;5m over 50m</li>
               <li>Fusion Rate: 10Hz</li>
               <li>Transition: &lt;5ms</li>
             </ul>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function App() {
  const [activeTab1, setActiveTab1] = useState(3); // Calibration
  const [activeTab2, setActiveTab2] = useState(1); // Dashboard
  const [activeTab3, setActiveTab3] = useState(2); // Map
  
  const [telemetry, setTelemetry] = useState<TelemetryItem[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // For animation
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<number | null>(null);

  const startSimulation = async () => {
    setIsSimulating(true);
    setErrorMsg('');
    setTelemetry([]);
    setCurrentIndex(0);
    
    try {
      const res = await fetch('http://localhost:8000/simulate', { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Simulation failed: ${res.status}`);
      }
      
      const telemRes = await fetch('http://localhost:8000/telemetry');
      if (!telemRes.ok) {
        throw new Error(`Telemetry failed: ${telemRes.status}`);
      }
      
      const data: TelemetryItem[] = await telemRes.json();
      setTelemetry(data);
      
      // Start playback
      let i = 0;
      timerRef.current = window.setInterval(() => {
        i++;
        if (i >= data.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsSimulating(false);
          return;
        }
        setCurrentIndex(i);
      }, 100); // 10Hz
      
    } catch (e: any) {
      setErrorMsg(e.message);
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const history = telemetry.slice(0, currentIndex + 1);
  const currentSpeed = history.length > 0 ? history[history.length - 1].speed_m_s : 0;

  return (
    <div className="min-h-screen bg-bg pt-8 font-sans relative overflow-hidden">
      
      {/* Decorative Satellite Icon */}
      <div className="absolute top-8 right-8 text-navy/20 hidden md:block">
        <Satellite strokeWidth={1.5} className="w-10 h-10" />
      </div>

      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-center font-bold uppercase text-[22px] text-navy mb-12 relative z-10">
          SMARTPHONE EXECUTION
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-6 md:gap-[clamp(24px,4vw,64px)] items-center justify-center max-w-[1240px] mx-auto">
          
          {/* Phone 1 */}
          <div className="flex flex-col items-center gap-4">
            <div className="font-bold text-[15px] text-navy">1. Home & Calibration</div>
            <PhoneFrame activeTab={activeTab1} onTabChange={setActiveTab1}>
               <Screen1 onStart={startSimulation} isSimulating={isSimulating} errorMsg={errorMsg} />
            </PhoneFrame>
            <div className="font-bold text-[13px] text-captionNavy text-center mt-2">Home Page</div>
          </div>

          <div className="rotate-90 md:rotate-0 flex justify-center">
            <ArrowIcon />
          </div>

          {/* Phone 2 */}
          <div className="flex flex-col items-center gap-4">
            <div className="font-bold text-[15px] text-navy">2. Outage Dashboard</div>
            <PhoneFrame activeTab={activeTab2} onTabChange={setActiveTab2}>
               <Screen2 speed={currentSpeed} />
            </PhoneFrame>
            <div className="font-bold text-[13px] text-captionNavy text-center mt-2">Dashboard During<br/>GNSS Outage</div>
          </div>

          <div className="rotate-90 md:rotate-0 flex justify-center">
            <ArrowIcon />
          </div>

          {/* Phone 3 */}
          <div className="flex flex-col items-center gap-4">
            <div className="font-bold text-[15px] text-navy">3. Fusion Map</div>
            <PhoneFrame activeTab={activeTab3} onTabChange={setActiveTab3}>
               <Screen3 history={history} />
            </PhoneFrame>
            <div className="font-bold text-[13px] text-captionNavy text-center mt-2">Fusion Map</div>
          </div>

        </div>

      </div>

      <div className="mt-20 border-t border-navy/10 pt-16">
        <SystemDataFlow />
      </div>

    </div>
  );
}
