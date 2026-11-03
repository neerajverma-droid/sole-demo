'use client';

import React, { useEffect, useState } from 'react';

interface BrandSplashLoaderProps {
  /** Minimum time to show the loader in milliseconds (prevents quick flickering) */
  minDuration?: number;
  /** Background theme */
  theme?: 'light' | 'dark' | 'auto';
  /** Show the animated progress line below the logo */
  showProgress?: boolean;
  /** Optional callback fired when loader animation completes */
  onComplete?: () => void;
  /**
   * Keep spinning indefinitely instead of self-hiding after `minDuration`.
   * Use this whenever an outside condition (a pending request, an auth
   * status) controls how long the loader stays mounted — a fixed timer would
   * fade it out from under a still-loading screen.
   */
  persist?: boolean;
  text?: string;
}

export default function BrandSplashLoader({
  minDuration = 100,
  theme = 'light',
  showProgress = true,
  onComplete,
  persist = true,
  text,
}: BrandSplashLoaderProps) {
  const [loading, setLoading] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Double rAF so the browser paints the hidden (opacity 0, blurred) state
    // first, then commits the change that triggers the transition into view.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // Lock body scrolling while loading
    document.body.style.overflow = 'hidden';

    if (persist) {
      return () => {
        document.body.style.overflow = '';
      };
    }

    const timer = setTimeout(() => {
      setFadeOut(true);

      const removeTimer = setTimeout(() => {
        setLoading(false);
        document.body.style.overflow = '';
        if (onComplete) onComplete();
      }, 600); // Matches transition duration (600ms)

      return () => clearTimeout(removeTimer);
    }, minDuration);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = '';
    };
  }, [minDuration, onComplete, persist]);

  if (!loading) return null;

  const themeBackground =
    theme === 'dark' ? '#0d0f17' : theme === 'light' ? '#ffffff' : undefined;
  const themeColor =
    theme === 'dark' ? '#ffffff' : theme === 'light' ? '#131432' : undefined;

  return (
    <div
      className={`splash-container ${theme} ${entered ? 'visible' : ''} ${fadeOut ? 'fade-out' : ''}`}
      aria-label="Loading application"
      role="status"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: themeBackground,
        color: themeColor,
      }}
    >
      <div
        className="splash-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.75rem',
        }}
      >
        {/* Brand Wordmark "S · le" */}
        <div
          className="brand-wordmark"
          style={{
            display: 'flex',
            alignItems: 'center',
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: '3.6rem',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            userSelect: 'none',
          }}
        >
          <span className="brand-letter">S</span>

          <div
            className="brand-icon-wrapper"
            style={{
              width: 52,
              height: 52,
              margin: '0 4px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              className="brand-icon-spin"
              width={52}
              height={52}
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Satellite top and bottom dots */}
              <circle cx="100" cy="28" r="10" fill="#4F58FE" />
              <circle cx="100" cy="172" r="10" fill="#4F58FE" />

              {/* Horizontal pills */}
              <path d="M24 100 H66" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />
              <path d="M134 100 H176" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />

              {/* Cross diagonals */}
              <path d="M123 77 L158 42" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />
              <path d="M42 158 L77 123" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />

              {/* Main diagonal */}
              <path d="M42 42 L158 158" stroke="#4F58FE" strokeWidth="20" strokeLinecap="round" />
            </svg>
          </div>

          <span className="brand-letter">le</span>
        </div>

        {/* Animated Loading Bar */}
        {showProgress && (
          <div className="progress-track">
            <div className="progress-bar" />
          </div>
        )}

        {text && (
          <p className="splash-text" aria-live="polite">
            {text}
          </p>
        )}
      </div>

      {/* Scoped CSS - zero external config required */}
      <style jsx>{`
        .splash-container {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          transition:
            opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1),
            visibility 0.6s,
            backdrop-filter 0.6s cubic-bezier(0.4, 0, 0.2, 1),
            -webkit-backdrop-filter 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          backdrop-filter: blur(0px);
          -webkit-backdrop-filter: blur(0px);
          opacity: 0;
          visibility: visible;
        }

        .splash-container.visible {
          opacity: 1;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .splash-container.fade-out {
          opacity: 0;
          visibility: hidden;
          backdrop-filter: blur(0px);
          -webkit-backdrop-filter: blur(0px);
          pointer-events: none;
        }

        /* Light Theme */
        .splash-container.light {
          background-color: #ffffff;
          color: #131432;
        }

        /* Dark Theme */
        .splash-container.dark {
          background-color: #0d0f17;
          color: #ffffff;
        }

        /* Auto / System match */
        @media (prefers-color-scheme: dark) {
          .splash-container.auto {
            background-color: #0d0f17;
            color: #ffffff;
          }
          .splash-container.auto .progress-track {
            background-color: rgba(255, 255, 255, 0.1);
          }
        }

        .splash-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.75rem;
        }

        .brand-wordmark {
          display: flex;
          align-items: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 3.6rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          user-select: none;
        }

        .brand-letter {
          line-height: 1;
        }

        .brand-icon-wrapper {
          width: 52px;
          height: 52px;
          margin: 0 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .brand-icon-spin {
          width: 100%;
          height: 100%;
          animation: brandSpin 2.4s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite;
        }

        @keyframes brandSpin {
          0% {
            transform: scale(1) rotate(0deg);
          }
          40% {
            transform: scale(1.15) rotate(180deg);
          }
          50% {
            transform: scale(1.05) rotate(180deg);
          }
          90% {
            transform: scale(1.15) rotate(360deg);
          }
          100% {
            transform: scale(1) rotate(360deg);
          }
        }

        .splash-text {
          margin: -0.5rem 0 0;
          max-width: 320px;
          text-align: center;
          font-size: 0.875rem;
          line-height: 1.5;
          opacity: 0.65;
          white-space: pre-line;
        }

        .progress-track {
          width: 160px;
          height: 4px;
          background-color: rgba(0, 0, 0, 0.08);
          border-radius: 999px;
          overflow: hidden;
          position: relative;
        }

        .splash-container.dark .progress-track {
          background-color: rgba(255, 255, 255, 0.12);
        }

        .progress-bar {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 100%;
          background: linear-gradient(90deg, #4f58fe, #818cf8);
          border-radius: 999px;
          animation: progressSlide 1.6s ease-in-out infinite;
        }

        @keyframes progressSlide {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}