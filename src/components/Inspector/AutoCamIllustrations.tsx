import React from 'react';

export function FollowViewIllustration() {
return (
    <svg viewBox="0 0 100 60" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background gradient/horizon */}
      <path d="M0 35 Q 50 25 100 35 L 100 60 L 0 60 Z" fill="hsl(var(--primary) / 0.15)" />
      {/* Trees */}
      <circle cx="20" cy="30" r="8" fill="hsl(var(--item-route) / 0.5)" />
      <circle cx="80" cy="32" r="7" fill="hsl(var(--item-route) / 0.5)" />
      <rect x="18" y="36" width="4" height="6" fill="hsl(var(--muted-foreground))" opacity="0.4" />
      <rect x="78" y="37" width="4" height="5" fill="hsl(var(--muted-foreground))" opacity="0.4" />
      {/* Perspective Road */}
      <path d="M45 28 L 55 28 L 85 60 L 15 60 Z" fill="hsl(var(--primary) / 0.7)" />
      <path d="M49 30 L 51 30 L 53 60 L 47 60 Z" fill="hsl(var(--primary-foreground))" opacity="0.8" />
      {/* Little Car */}
      <rect x="42" y="44" width="16" height="10" rx="3" fill="hsl(var(--primary))" stroke="hsl(var(--primary-foreground))" strokeWidth="1" />
      <rect x="45" y="46" width="10" height="4" rx="1" fill="hsl(var(--primary-foreground) / 0.7)" />
    </svg>
);
}

export function NavigationViewIllustration() {
return (
    <svg viewBox="0 0 100 60" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Map grid lines */}
      <path d="M10 20 L 90 20 M10 40 L 90 40 M30 10 L 30 50 M70 10 L 70 50" stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      {/* Map Route line with turn */}
      <path d="M20 45 L 50 45 Q 65 45 65 30 L 65 15" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" />
      {/* Route dot */}
      <circle cx="20" cy="45" r="4" fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth="2" />
      {/* Navigation pointer arrow */}
      <circle cx="65" cy="15" r="8" fill="hsl(var(--primary))" />
      <path d="M65 10 L 69 18 L 65 16 L 61 18 Z" fill="hsl(var(--primary-foreground))" />
    </svg>
);
}
