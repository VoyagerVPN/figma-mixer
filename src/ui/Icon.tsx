const paths = {
    close: 'm4 4 8 8M12 4l-8 8', settings: 'M6 3h4l.5 2 1.5 1 2-.5 1 3-1.5 1.5v2L11 14l-1.5-1H7L5.5 14 3 12l.5-2L2 8.5l1-3L5 6l1-1zM10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
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
    dynamic: 'M2 10h4v4H2zM6 6h4v4H6zM10 2h4v4h-4z',
    airy: 'M5 2H2v3M11 2h3v3M2 11v3h3M11 14h3v-3M6 6h4v4H6z',
    landscape: 'M1.5 3.5h13v9h-13z', square: 'M2.5 2.5h11v11h-11z', portrait: 'M3.5 1.5h9v13h-9z',
    palette: 'M8 1.5a6.5 6.5 0 1 0 0 13h1a1.5 1.5 0 0 0 1-2.6 1.5 1.5 0 0 1 1-2.6h1.5a2 2 0 0 0 2-2A6 6 0 0 0 8 1.5M4.5 5.5h.01M8 4h.01M11.5 5.5h.01M4 9h.01',
    crop: 'M5 1v10h10M1 5h10v10',
    save: 'M2 2h10l2 2v10H2zM5 2v4h6V2M5 14V9h6v5',
    key: 'M9 5a3 3 0 1 1 6 0 3 3 0 0 1-6 0M10 7 3 14H1v-2l2-2h2V8h2l1.5-1.5',
    folder: 'M1.5 4V2.5h5l1.5 2h6.5V13h-13z',
    locate: 'M8 1v3M8 12v3M1 8h3M12 8h3M12.5 8a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0',
    chevron: 'm6 3 5 5-5 5',
    plane: 'M1.5 12 8 3l6.5 9z'
};
export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return <svg className="ui-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
