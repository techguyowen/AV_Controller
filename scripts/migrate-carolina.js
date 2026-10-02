/**
 * scripts/migrate-carolina.js
 * Migrates Sanctuary AV Controller UI to the Antigravity-Carolina design system.
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

console.log(`Found ${htmlFiles.length} HTML files to migrate...`);

const carolinaStyles = `
        :root {
            /* Antigravity-Carolina Design System Tokens */
            --bg-base: #090D13;
            --bg-surface: #101722;
            --bg-surface-raised: #182230;
            --border-subtle: #243242;
            --border-focus: #7BAFD4;
            --color-accent: #7BAFD4;
            --color-accent-hover: #93BFDF;
            --color-accent-subtle: #12263A;
            --color-on-accent: #081018;
            --color-primary: #F0F6FC;
            --color-secondary: #8B9BB0;
            --radius-sm: 4px;
            --radius-md: 6px;
            --radius-lg: 10px;
            --radius-full: 9999px;

            /* Legacy compatibility mappings */
            --bg-panel: var(--bg-surface);
            --bg-card: var(--bg-surface-raised);
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
            background-color: var(--bg-base);
            color: var(--color-primary);
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        .font-mono {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-variant-numeric: tabular-nums slashed-zero;
        }

        /* Antigravity-Carolina Components */
        .button-primary {
            background-color: var(--color-accent);
            color: var(--color-on-accent);
            border-radius: var(--radius-md);
            padding: 10px 16px;
            font-weight: 600;
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.15s ease;
        }
        .button-primary:hover {
            background-color: var(--color-accent-hover);
            color: var(--color-on-accent);
        }

        .card-carolina {
            background-color: var(--bg-surface);
            color: var(--color-primary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 16px;
        }

        .card-option {
            background-color: var(--bg-surface);
            color: var(--color-primary);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 16px;
        }

        .card-option-selected {
            background-color: var(--color-accent-subtle);
            color: var(--color-primary);
            border: 1px solid var(--color-accent);
            border-radius: var(--radius-lg);
            padding: 16px;
        }

        .segmented-track {
            background-color: var(--bg-surface);
            color: var(--color-secondary);
            border-radius: var(--radius-md);
            padding: 4px;
        }

        .segmented-item-active {
            background-color: var(--bg-surface-raised);
            color: var(--color-primary);
            border-radius: var(--radius-sm);
            padding: 8px 12px;
        }

        .badge-carolina {
            background-color: var(--bg-surface-raised);
            color: var(--color-accent);
            border-radius: var(--radius-full);
            padding: 4px 10px;
            font-size: 0.75rem;
            font-weight: 600;
        }
`;

function migrateContent(content) {
  let updated = content;

  // 1. Inject or update Root & Style Variables
  if (updated.includes(':root {')) {
    updated = updated.replace(/:root\s*\{[^}]*\}/s, `:root {
            --bg-base: #090D13;
            --bg-panel: #101722;
            --bg-card: #182230;
            --border-subtle: #243242;
            --border-focus: #7BAFD4;
            --color-accent: #7BAFD4;
            --color-accent-hover: #93BFDF;
            --color-accent-subtle: #12263A;
            --color-on-accent: #081018;
            --color-primary: #F0F6FC;
            --color-secondary: #8B9BB0;
            --radius-sm: 4px;
            --radius-md: 6px;
            --radius-lg: 10px;
            --radius-full: 9999px;
        }`);
  }

  updated = updated.replace(/content="#0a0d13"/g, 'content="#090D13"');
  updated = updated.replace(/content="#0a0e17"/g, 'content="#090D13"');
  updated = updated.replace(/bg-\[#0a0d13\]/g, 'bg-[#090D13]');
  updated = updated.replace(/bg-\[#0a0e17\]/g, 'bg-[#090D13]');

  // 2. Font Stacks
  updated = updated.replace(/font-family:\s*'Plus Jakarta Sans'[^;]+;/g, 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;');
  updated = updated.replace(/font-family:\s*'JetBrains Mono'[^;]+;/g, 'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;');

  // 3. Color Substitutions (Cyan -> Carolina Blue #7BAFD4, Subtle #12263A, Ink #081018)
  // Text colors
  updated = updated.replace(/\btext-cyan-300\b/g, 'text-[#7BAFD4]');
  updated = updated.replace(/\btext-cyan-400\b/g, 'text-[#7BAFD4]');
  updated = updated.replace(/\btext-cyan-500\b/g, 'text-[#7BAFD4]');
  updated = updated.replace(/\btext-cyan-600\b/g, 'text-[#7BAFD4]');
  
  // Hover text colors
  updated = updated.replace(/\bhover:text-cyan-300\b/g, 'hover:text-[#93BFDF]');
  updated = updated.replace(/\bhover:text-cyan-400\b/g, 'hover:text-[#93BFDF]');
  updated = updated.replace(/\bhover:text-cyan-500\b/g, 'hover:text-[#93BFDF]');

  // Background colors
  updated = updated.replace(/\bbg-cyan-500\b/g, 'bg-[#7BAFD4] text-[#081018]');
  updated = updated.replace(/\bbg-cyan-600\b/g, 'bg-[#7BAFD4] text-[#081018]');
  updated = updated.replace(/\bhover:bg-cyan-500\b/g, 'hover:bg-[#93BFDF]');
  updated = updated.replace(/\bhover:bg-cyan-400\b/g, 'hover:bg-[#93BFDF]');
  updated = updated.replace(/\bactive:bg-cyan-500\b/g, 'active:bg-[#7BAFD4] active:text-[#081018]');
  updated = updated.replace(/\bactive:bg-cyan-600\b/g, 'active:bg-[#7BAFD4] active:text-[#081018]');

  // Subtle backgrounds (cards, tags, containers)
  updated = updated.replace(/\bbg-cyan-950\/40\b/g, 'bg-[#12263A]');
  updated = updated.replace(/\bbg-cyan-950\/80\b/g, 'bg-[#12263A]');
  updated = updated.replace(/\bbg-cyan-950\b/g, 'bg-[#12263A]');
  updated = updated.replace(/\bbg-cyan-900\/40\b/g, 'bg-[#12263A]');
  updated = updated.replace(/\bbg-cyan-900\/50\b/g, 'bg-[#12263A]');
  updated = updated.replace(/\bbg-cyan-900\b/g, 'bg-[#12263A]');

  // Borders
  updated = updated.replace(/\bborder-cyan-500\/30\b/g, 'border-[#7BAFD4]/40');
  updated = updated.replace(/\bborder-cyan-500\b/g, 'border-[#7BAFD4]');
  updated = updated.replace(/\bborder-cyan-700\b/g, 'border-[#7BAFD4]');
  updated = updated.replace(/\bborder-cyan-800\b/g, 'border-[#7BAFD4]/50');
  updated = updated.replace(/\bfocus:border-cyan-500\b/g, 'focus:border-[#7BAFD4]');
  updated = updated.replace(/\baccent-cyan-400\b/g, 'accent-[#7BAFD4]');

  // Slate updates (Surface #101722, Surface Raised #182230, Border #243242, Primary #F0F6FC, Secondary #8B9BB0)
  updated = updated.replace(/\bbg-slate-950\b/g, 'bg-[#090D13]');
  updated = updated.replace(/\bbg-slate-900\b/g, 'bg-[#101722]');
  updated = updated.replace(/\bbg-slate-800\b/g, 'bg-[#182230]');
  updated = updated.replace(/\bborder-slate-800\b/g, 'border-[#243242]');
  updated = updated.replace(/\bborder-slate-700\b/g, 'border-[#243242]');

  return updated;
}

for (const file of htmlFiles) {
  const filePath = path.join(publicDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const migrated = migrateContent(content);
  fs.writeFileSync(filePath, migrated);
  console.log(`✓ Migrated ${file}`);
}

console.log('Migration complete!');
