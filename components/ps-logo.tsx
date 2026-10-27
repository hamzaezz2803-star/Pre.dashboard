import React from "react";

interface PsLogoProps {
  className?: string;
  size?: number;
}

/**
 * Logo PS métallique 3D bleu haute fidélité inspiré du modèle de rapport.
 */
export function PsLogo({ className = "", size = 48 }: PsLogoProps) {
  const width = size * 1.5;
  const height = size;

  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 150 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-md"
      >
        <defs>
          {/* Dégradé principal chrome bleu 3D */}
          <linearGradient id="psBlueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0a2540" />
            <stop offset="25%" stopColor="#004e92" />
            <stop offset="50%" stopColor="#0072ff" />
            <stop offset="70%" stopColor="#1e88e5" />
            <stop offset="90%" stopColor="#003566" />
            <stop offset="100%" stopColor="#001833" />
          </linearGradient>

          {/* Reflet métallique brillant sur le haut */}
          <linearGradient id="psSheenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#1d4ed8" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#001a33" stopOpacity="0.9" />
          </linearGradient>

          {/* Contour métallique argenté / cyan */}
          <linearGradient id="psStrokeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#60a5fa" />
            <stop offset="70%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#93c5fd" />
          </linearGradient>

          {/* Ombre portée 3D profonde */}
          <filter id="psShadow" x="-20%" y="-20%" width="150%" height="150%">
            <feDropShadow dx="3" dy="5" stdDeviation="3" floodColor="#001122" floodOpacity="0.6" />
          </filter>
        </defs>

        <g filter="url(#psShadow)" transform="skewX(-10)">
          {/* Lettre P */}
          <path
            d="M 22 88 L 44 88 L 52 46 L 72 46 C 88 46 98 38 98 24 C 98 10 88 4 68 4 L 32 4 Z M 48 34 L 52 16 L 68 16 C 76 16 80 18 80 25 C 80 32 76 34 68 34 Z"
            fill="url(#psBlueGradient)"
            stroke="url(#psStrokeGradient)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Lettre S (entrelacée avec le P) */}
          <path
            d="M 68 88 L 118 88 C 134 88 144 80 144 68 C 144 56 134 50 114 46 C 98 42 94 38 94 32 C 94 26 100 22 110 22 C 120 22 130 25 138 30 L 144 14 C 136 9 122 6 108 6 C 90 6 78 14 78 28 C 78 40 88 46 108 50 C 124 54 128 58 128 64 C 128 70 120 74 110 74 C 98 74 84 70 74 62 Z"
            fill="url(#psBlueGradient)"
            stroke="url(#psStrokeGradient)"
            strokeWidth="2"
            strokeLinejoin="round"
          />

          {/* Reflet brillant supérieur */}
          <path
            d="M 32 4 L 68 4 C 88 4 98 10 98 24 C 98 29 96 33 92 36 L 50 36 L 48 34 L 52 16 L 68 16 C 76 16 80 18 80 25 C 80 27 79 28 78 30 L 76 34 L 46 34 L 32 4 Z"
            fill="url(#psSheenGradient)"
            opacity="0.6"
          />
        </g>
      </svg>
    </div>
  );
}
