const paths = {
    refresh: 'M13.5 6A5.7 5.7 0 0 0 3 4.7L1.5 7M1.5 3.5V7H5M2.5 10A5.7 5.7 0 0 0 13 11.3l1.5-2.3M14.5 12.5V9H11',
    help: 'M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0M6.2 5.8a1.9 1.9 0 0 1 3.7.6c0 1.2-1.9 1.4-1.9 2.6v.3M8 11.5h.01',
    close: 'm4 4 8 8M12 4l-8 8', settings: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915',
    arrow: 'M12 8H4m4-4L4 8l4 4', check: 'm3 8 3 3 7-7', plus: 'M8 3v10M3 8h10', minus: 'M3 8h10',
    star: 'm8 1.5 2 4.2 4.6.6-3.3 3.2.8 4.5L8 11.9l-4.1 2.1.8-4.5L1.4 6.3l4.6-.6z',
    up: 'M8 13V3m-4 4 4-4 4 4', down: 'M8 3v10m-4-4 4 4 4-4', grip: 'M5 3h.01M11 3h.01M5 8h.01M11 8h.01M5 13h.01M11 13h.01',
    grid: 'M2 2h4.5v4.5H2zM9.5 2H14v4.5H9.5zM2 9.5h4.5V14H2zM9.5 9.5H14V14H9.5z',
    composition: 'M2 2h12v12H2zM2 10l4-4 4 4 4-3M10.5 5h.01',
    layers: 'm8 1.5 6.5 3.3L8 8 1.5 4.8zM1.5 8 8 11.2 14.5 8M1.5 11.5 8 14.7l6.5-3.2',
    selection: 'M6 2H2v4M10 2h4v4M2 10v4h4M10 14h4v-4M6 6l5 2-2 1-1 2z',
    upload: 'M8 10V2M5 5l3-3 3 3M2 10v4h12v-4',
    download: 'M8 2v8M5 7l3 3 3-3M2 10v4h12v-4',
    edit: 'm10 2 4 4M2 14l4-1 8-8-4-4-8 8z',
    search: 'M10.5 6.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0M9.5 9.5l4 4',
    balanced: 'M2 3h5v5H2zM9 5h5v8H9zM2 10h3v3H2z',
    airy: 'M5 2H2v3M11 2h3v3M2 11v3h3M11 14h3v-3M6 6h4v4H6z',
    ratio16x9: 'M1.6 4.4h12.8v7.2H1.6z',
    ratio4x3: 'M1.6 3.2h12.8v9.6H1.6z',
    ratio5x4: 'M1.6 2.88h12.8v10.24H1.6z',
    ratio1x1: 'M1.6 1.6h12.8v12.8H1.6z',
    ratio4x5: 'M2.88 1.6h10.24v12.8H2.88z',
    ratio3x4: 'M3.2 1.6h9.6v12.8H3.2z',
    ratio9x16: 'M4.4 1.6h7.2v12.8H4.4z',
    palette: 'M8 1.5a6.5 6.5 0 1 0 0 13h1a1.5 1.5 0 0 0 1-2.6 1.5 1.5 0 0 1 1-2.6h1.5a2 2 0 0 0 2-2A6 6 0 0 0 8 1.5M4.5 5.5h.01M8 4h.01M11.5 5.5h.01M4 9h.01',
    crop: 'M5 1v10h10M1 5h10v10',
    detail: 'M2 4h3m3 0h6M2 8h6m3 0h3M2 12h3m3 0h6M5 2.5v3m6 1v3m-6 1v3',
    save: 'M2 2h10l2 2v10H2zM5 2v4h6V2M5 14V9h6v5',
    key: 'M9 5a3 3 0 1 1 6 0 3 3 0 0 1-6 0M10 7 3 14H1v-2l2-2h2V8h2l1.5-1.5',
    folder: 'M1.5 4V2.5h5l1.5 2h6.5V13h-13z',
    locate: 'M8 1v3M8 12v3M1 8h3M12 8h3M12.5 8a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0',
    chevron: 'm6 3 5 5-5 5',
    plane: 'M1.5 12 8 3l6.5 9z'
};
export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  const settings = name === 'settings';
  // Lucide Settings, лицензия ISC: licenses/lucide-settings.txt.
  return <svg className="ui-icon" width="16" height="16" viewBox={settings ? "0 0 24 24" : "0 0 16 16"} fill="none" stroke="currentColor" strokeWidth={settings ? 2.25 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} />{settings && <circle cx="12" cy="12" r="3" />}</svg>;
}
