// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState, type CSSProperties } from 'react';
import { studioLayout } from '@app/camera/studioLayout';

function readViewport() {
  const visual = window.visualViewport;
  return { width: window.innerWidth, height: window.innerHeight,
    keyboard: visual ? Math.max(0, window.innerHeight - visual.height - visual.offsetTop) : 0 };
}

export function useStudioLayout() {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const resize = () => setViewport(readViewport());
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
    };
  }, []);
  const layout = studioLayout(viewport.width, viewport.height);
  const style = { '--studio-panel': `${layout.panel}px`, '--studio-left': `${layout.left}px`,
    '--studio-bottom': `${layout.bottomInset}px`, '--studio-keyboard': `${viewport.keyboard}px` } as CSSProperties;
  return { layout, style };
}
