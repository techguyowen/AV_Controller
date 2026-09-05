const fs = require('fs');
const path = require('path');

const presetsDir = path.join(__dirname, '..', 'public', 'presets');
if (!fs.existsSync(presetsDir)) {
  fs.mkdirSync(presetsDir, { recursive: true });
}

const presets = {
  'cam1_preset1.svg': {
    title: 'PULPIT / PASTOR',
    cam: 'CAM 1',
    bg: '#0f172a',
    accent: '#38bdf8',
    icon: '<path d="M12 2v20M2 12h20" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/><rect x="8" y="14" width="8" height="8" rx="1" fill="#1e293b" stroke="#64748b" stroke-width="1.5"/><circle cx="12" cy="9" r="3" fill="#94a3b8"/>'
  },
  'cam1_preset2.svg': {
    title: 'WIDE STAGE',
    cam: 'CAM 1',
    bg: '#0f172a',
    accent: '#10b981',
    icon: '<rect x="4" y="15" width="16" height="6" rx="1" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/><polygon points="3,6 7,15 1,15" fill="#10b981" opacity="0.2"/><polygon points="21,6 17,15 23,15" fill="#10b981" opacity="0.2"/><circle cx="12" cy="12" r="2" fill="#94a3b8"/><circle cx="7" cy="13" r="1.5" fill="#94a3b8"/><circle cx="17" cy="13" r="1.5" fill="#94a3b8"/>'
  },
  'cam1_preset3.svg': {
    title: 'LECTERN / READER',
    cam: 'CAM 1',
    bg: '#0f172a',
    accent: '#a855f7',
    icon: '<rect x="13" y="12" width="7" height="10" rx="1" fill="#1e293b" stroke="#a855f7" stroke-width="1.5"/><path d="M14 9l3-2 3 2v3h-6z" fill="#a855f7" opacity="0.4"/><circle cx="16.5" cy="6" r="2" fill="#94a3b8"/>'
  },
  'cam1_preset4.svg': {
    title: 'PIANO / KEYS',
    cam: 'CAM 1',
    bg: '#0f172a',
    accent: '#f59e0b',
    icon: '<rect x="3" y="10" width="18" height="10" rx="2" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/><path d="M6 10v6M9 10v6M12 10v6M15 10v6M18 10v6" stroke="#64748b" stroke-width="1"/><rect x="7.5" y="10" width="1.5" height="3.5" fill="#f59e0b"/><rect x="13.5" y="10" width="1.5" height="3.5" fill="#f59e0b"/><rect x="16.5" y="10" width="1.5" height="3.5" fill="#f59e0b"/>'
  },
  'cam1_preset5.svg': {
    title: 'WORSHIP LEADER',
    cam: 'CAM 1',
    bg: '#0f172a',
    accent: '#ec4899',
    icon: '<circle cx="12" cy="7" r="3" fill="#ec4899" opacity="0.8"/><path d="M8 21v-4a4 4 0 0 1 8 0v4" stroke="#ec4899" stroke-width="1.5" fill="#1e293b"/><path d="M14 11l4 8M16 11l-4 8" stroke="#f43f5e" stroke-width="1.5"/>'
  },
  'cam1_preset6.svg': {
    title: 'ALTAR / COMMUNION',
    cam: 'CAM 1',
    bg: '#0f172a',
    accent: '#eab308',
    icon: '<rect x="4" y="14" width="16" height="7" rx="1" fill="#1e293b" stroke="#eab308" stroke-width="1.5"/><path d="M10 14v-4a2 2 0 0 1 4 0v4" fill="#eab308" opacity="0.4" stroke="#eab308" stroke-width="1"/><circle cx="12" cy="7" r="1.5" fill="#fbbf24"/>'
  },
  'cam1_preset7.svg': {
    title: 'BAPTISTRY',
    cam: 'CAM 1',
    bg: '#0f172a',
    accent: '#06b6d4',
    icon: '<path d="M3 15c3-1 6 1 9 0s6-1 9 0v6H3z" fill="#06b6d4" opacity="0.3" stroke="#06b6d4" stroke-width="1.5"/><path d="M3 18c3-1 6 1 9 0s6-1 9 0" stroke="#22d3ee" stroke-width="1.5"/><path d="M12 4v8M8 8h8" stroke="#38bdf8" stroke-width="1.5"/>'
  },
  'cam1_preset8.svg': {
    title: 'CONGREGATION',
    cam: 'CAM 1',
    bg: '#0f172a',
    accent: '#8b5cf6',
    icon: '<circle cx="8" cy="9" r="2" fill="#8b5cf6"/><circle cx="16" cy="9" r="2" fill="#8b5cf6"/><circle cx="12" cy="14" r="2" fill="#a78bfa"/><path d="M5 15a3 3 0 0 1 6 0M13 15a3 3 0 0 1 6 0M9 20a3 3 0 0 1 6 0" stroke="#64748b" stroke-width="1.5"/>'
  },
  'cam2_preset1.svg': {
    title: 'FULL SANCTUARY WIDE',
    cam: 'CAM 2',
    bg: '#090d16',
    accent: '#3b82f6',
    icon: '<polygon points="12,3 2,10 2,21 22,21 22,10" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5"/><path d="M12 3v18M2 21h20" stroke="#3b82f6" stroke-width="1" opacity="0.5"/><circle cx="12" cy="10" r="1.5" fill="#60a5fa"/>'
  },
  'cam2_preset2.svg': {
    title: 'CONGREGATION CENTER',
    cam: 'CAM 2',
    bg: '#090d16',
    accent: '#10b981',
    icon: '<rect x="4" y="11" width="16" height="3" rx="1" fill="#1e293b" stroke="#10b981" stroke-width="1"/><rect x="3" y="16" width="18" height="3" rx="1" fill="#1e293b" stroke="#10b981" stroke-width="1"/><path d="M12 11v8" stroke="#10b981" stroke-width="1.5" stroke-dasharray="1 2"/>'
  },
  'cam2_preset3.svg': {
    title: 'CHOIR LOFT',
    cam: 'CAM 2',
    bg: '#090d16',
    accent: '#f59e0b',
    icon: '<path d="M2 18h20M4 14h16M6 10h12" stroke="#f59e0b" stroke-width="1.5"/><circle cx="8" cy="7" r="1.5" fill="#fbbf24"/><circle cx="12" cy="7" r="1.5" fill="#fbbf24"/><circle cx="16" cy="7" r="1.5" fill="#fbbf24"/>'
  },
  'cam2_preset4.svg': {
    title: 'BAPTISTRY WIDE',
    cam: 'CAM 2',
    bg: '#090d16',
    accent: '#06b6d4',
    icon: '<rect x="13" y="8" width="8" height="12" rx="1" fill="#1e293b" stroke="#06b6d4" stroke-width="1.5"/><path d="M14 16c1.5-.5 3 .5 4.5 0" stroke="#22d3ee" stroke-width="1.5"/><path d="M17 10v4M15 12h4" stroke="#06b6d4" stroke-width="1"/>'
  },
  'cam2_preset5.svg': {
    title: 'CENTER AISLE',
    cam: 'CAM 2',
    bg: '#090d16',
    accent: '#a855f7',
    icon: '<polygon points="10,4 14,4 18,21 6,21" fill="#1e293b" stroke="#a855f7" stroke-width="1.5"/><path d="M12 4v17" stroke="#c084fc" stroke-width="1" stroke-dasharray="2 2"/>'
  },
  'cam2_preset6.svg': {
    title: 'SOUNDBOOTH / BALCONY',
    cam: 'CAM 2',
    bg: '#090d16',
    accent: '#64748b',
    icon: '<rect x="4" y="13" width="16" height="8" rx="1" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/><circle cx="8" cy="16" r="1" fill="#38bdf8"/><circle cx="12" cy="16" r="1" fill="#10b981"/><circle cx="16" cy="16" r="1" fill="#f59e0b"/><path d="M8 8l4 3 4-3" stroke="#64748b" stroke-width="1.5"/>'
  }
};

for (const [filename, item] of Object.entries(presets)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="100%" height="100%">
  <defs>
    <linearGradient id="grad_${filename.replace('.', '_')}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${item.bg}" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <radialGradient id="glow_${filename.replace('.', '_')}" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="${item.accent}" stop-opacity="0.25" />
      <stop offset="100%" stop-color="transparent" />
    </radialGradient>
  </defs>
  <rect width="160" height="90" fill="url(#grad_${filename.replace('.', '_')})" />
  <rect width="160" height="90" fill="url(#glow_${filename.replace('.', '_')})" />
  
  <!-- Subtle Grid Pattern -->
  <path d="M0 30h160M0 60h160M53 0v90M106 0v90" stroke="#334155" stroke-opacity="0.15" stroke-width="1" />
  
  <!-- Viewfinder Frame Lines -->
  <path d="M8 12h8M8 12v8M152 12h-8M152 12v8M8 78h8M8 78v-8M152 78h-8M152 78v-8" stroke="${item.accent}" stroke-width="1.5" stroke-opacity="0.5" fill="none"/>
  
  <!-- Center Icon Graphic -->
  <g transform="translate(68, 20) scale(1)">
    ${item.icon}
  </g>
  
  <!-- Camera Pill Badge -->
  <rect x="8" y="8" width="32" height="12" rx="3" fill="#000000" fill-opacity="0.8" stroke="#334155" stroke-width="0.5"/>
  <text x="24" y="17" fill="${item.accent}" font-family="monospace" font-size="7" font-weight="bold" text-anchor="middle">${item.cam}</text>
  
  <!-- Bottom Title Bar -->
  <rect x="0" y="66" width="160" height="24" fill="#020617" fill-opacity="0.9" />
  <text x="80" y="81" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="800" text-anchor="middle" letter-spacing="0.5">${item.title}</text>
</svg>`;

  fs.writeFileSync(path.join(presetsDir, filename), svg, 'utf8');
}

console.log('✓ Generated', Object.keys(presets).length, 'preset sample preview graphics in public/presets/');
