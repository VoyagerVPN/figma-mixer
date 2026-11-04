import { memo, useMemo } from 'react';

export const Preview = memo(function Preview({ svg, className = '' }: { svg: string; className?: string }) {
  const src = useMemo(() => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), [svg]);
  return <div className={'artwork ' + className}>{svg && <img src={src} alt="" draggable={false} />}</div>;
});
