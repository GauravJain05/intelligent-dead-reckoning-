import React, { useEffect, useState, useRef, Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import Lenis from 'lenis';
import './Intro.css';

const TunnelScene = lazy(() => import('./components/TunnelScene.jsx'));

export default function Intro() {
  const [scrollY, setScrollY] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const mousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Check reduced motion & mobile screens
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches || window.innerWidth < 768);

    const handleMouseMove = (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      mousePos.current = { x, y };
    };

    window.addEventListener('mousemove', handleMouseMove);

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
    });

    lenis.on('scroll', (e) => {
      setScrollY(e.scroll);
      const maxScroll = window.innerHeight * 1.5;
      const progress = Math.min(Math.max(e.scroll / maxScroll, 0), 1);
      setScrollProgress(progress);
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const animId = requestAnimationFrame(raf);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="intro-container">
      {/* 3D Tunnel Scene Layer */}
      {!isReducedMotion && (
        <Suspense fallback={null}>
          <TunnelScene scrollProgress={scrollProgress} mousePos={mousePos} />
        </Suspense>
      )}

      {/* Foreground Minimal Text Overlay */}
      <div className="intro-overlay">
        <div className="intro-content">
          <div className="intro-tag">
            <span className="intro-dot"></span>
            SIH PS 26168 • NAVNIRANTAR
          </div>

          <h1 className="intro-title">
            Navigating Satellite Blackouts
          </h1>

          <p className="intro-desc">
            Continuous high-precision vehicle state estimation using Invariant Extended Kalman Filtering (IEKF) and deep neural speed estimation.
          </p>

          <div className="intro-actions">
            <Link to="/home" className="btn-cta-primary intro-btn">
              Proceed to Website ➔
            </Link>
          </div>
        </div>
      </div>

      {/* Scroll indicator prompt */}
      <div className="scroll-prompt">
        <span className="scroll-mouse"></span>
        <span className="scroll-label">Scroll to fly through tunnel</span>
      </div>
    </div>
  );
}
