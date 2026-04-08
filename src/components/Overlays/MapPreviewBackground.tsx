/**
 * Abstract decorative "map" SVG used as the background of the overlay preview.
 * Purely illustrative — no project data, no live updates.
 */
export function MapPreviewBackground() {
  return (
    <svg
      viewBox="0 0 800 450"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      aria-hidden="true"
    >
      {/* Ocean / base */}
      <rect width="800" height="450" fill="#1a2a3a" />

      {/* Subtle lat/lon grid */}
      <g stroke="#2a3d52" strokeWidth="0.5" opacity="0.6">
        {[75, 150, 225, 300, 375, 450, 525, 600, 675, 750].map((x) => (
          <line key={`v${x}`} x1={x} y1={0} x2={x} y2={450} />
        ))}
        {[90, 180, 270, 360].map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={800} y2={y} />
        ))}
      </g>

      {/* Land masses */}
      {/* Large continent — top-left */}
      <path
        d="M 20 40 C 60 20 130 30 180 60 C 220 85 240 110 260 130
           C 280 150 300 160 290 185 C 278 210 250 215 230 230
           C 210 245 195 260 170 265 C 140 270 110 255 90 240
           C 65 222 40 205 28 180 C 14 152 8 125 12 100 Z"
        fill="#2d4a35"
        opacity="0.85"
      />
      {/* Sub-island top-left */}
      <path
        d="M 50 310 C 70 295 100 300 115 320 C 128 338 120 360 100 368
           C 78 376 52 362 46 345 Z"
        fill="#2d4a35"
        opacity="0.75"
      />

      {/* Central land mass */}
      <path
        d="M 310 80 C 360 60 440 70 490 95 C 535 118 555 150 560 185
           C 565 220 550 250 530 268 C 508 288 475 292 448 285
           C 418 278 395 260 375 250 C 352 238 330 240 315 222
           C 295 200 290 170 295 148 C 300 124 295 98 310 80 Z"
        fill="#2d4a35"
        opacity="0.88"
      />
      {/* Central peninsula */}
      <path
        d="M 430 285 C 445 295 455 315 448 338 C 441 360 420 368 405 358
           C 390 348 388 325 398 308 Z"
        fill="#2d4a35"
        opacity="0.75"
      />

      {/* Eastern continent */}
      <path
        d="M 600 50 C 640 35 700 45 740 75 C 770 98 780 130 775 165
           C 770 198 752 220 730 238 C 706 258 675 262 650 252
           C 624 241 605 218 598 192 C 588 162 588 132 592 108 Z"
        fill="#2d4a35"
        opacity="0.82"
      />

      {/* Bottom land strip */}
      <path
        d="M 0 370 C 50 355 120 360 190 375 C 250 388 310 395 380 390
           C 440 385 500 370 560 375 C 620 380 680 395 740 392
           C 775 390 800 385 800 385 L 800 450 L 0 450 Z"
        fill="#2d4a35"
        opacity="0.7"
      />

      {/* Rivers / waterways */}
      <g stroke="#1e3448" strokeWidth="1.5" fill="none" opacity="0.8">
        <path d="M 155 90 C 160 120 158 150 162 175 C 165 195 170 210 168 240" />
        <path d="M 420 110 C 425 135 430 158 428 180 C 426 200 420 215 425 240" />
      </g>

      {/* Roads */}
      <g stroke="#3d5a72" strokeWidth="1" fill="none" opacity="0.7">
        {/* Horizontal road */}
        <path d="M 0 225 L 150 220 L 260 225 L 400 218 L 520 222 L 650 215 L 800 220" />
        {/* Diagonal road */}
        <path d="M 200 160 L 300 200 L 380 240 L 420 290 L 460 350" />
        <path d="M 520 100 L 560 150 L 590 200 L 620 260" />
      </g>

      {/* City dots */}
      <g fill="#7ba8c4" opacity="0.9">
        <circle cx="140" cy="120" r="4" />
        <circle cx="235" cy="175" r="3" />
        <circle cx="430" cy="140" r="5" />
        <circle cx="480" cy="220" r="3" />
        <circle cx="670" cy="110" r="4" />
        <circle cx="720" cy="180" r="3" />
      </g>
      {/* City halos */}
      <g fill="none" stroke="#7ba8c4" strokeWidth="0.8" opacity="0.35">
        <circle cx="140" cy="120" r="9" />
        <circle cx="430" cy="140" r="11" />
        <circle cx="670" cy="110" r="9" />
      </g>

      {/* Water shimmer lines */}
      <g stroke="#243c52" strokeWidth="0.5" opacity="0.4">
        <path d="M 0 280 Q 100 275 200 282 Q 300 288 400 280 Q 500 272 600 278 Q 700 284 800 278" />
        <path d="M 0 300 Q 120 295 240 303 Q 360 310 480 300 Q 600 290 720 298 Q 760 302 800 298" />
        <path d="M 0 320 Q 80 315 160 322 Q 280 330 400 320 Q 520 310 640 318 Q 730 324 800 318" />
      </g>

      {/* Vignette overlay for depth */}
      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="60%" stopColor="transparent" />
        <stop offset="100%" stopColor="#0d1a24" stopOpacity="0.6" />
      </radialGradient>
      <rect width="800" height="450" fill="url(#vignette)" />
    </svg>
  );
}
