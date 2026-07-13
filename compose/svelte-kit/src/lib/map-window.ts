import { mapWindowStore, mapShellStore, mapPanelStore, type MapRect } from '../stores/mapStore';

function trackRect(node: HTMLElement, publish: (rect: MapRect | null) => void) {
  function update() {
    const r = node.getBoundingClientRect();
    publish({ top: r.top, left: r.left, width: r.width, height: r.height });
  }
  // Scroll fires far faster than a frame; coalescing to one publish per frame
  // stops the fixed map's window frame from thrashing and lagging native
  // scroll on mobile. Resize and the observer stay immediate.
  let scheduled = 0;
  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      update();
    });
  }
  const observer = new ResizeObserver(update);
  observer.observe(node);
  window.addEventListener('resize', update);
  window.addEventListener('scroll', scheduleUpdate, true);
  update();
  return () => {
    if (scheduled) cancelAnimationFrame(scheduled);
    observer.disconnect();
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', scheduleUpdate, true);
    publish(null);
  };
}

// Registers the element's rect as the persistent map's interactive window
// while mounted; `overlay: false` is the reduced mini-window chrome.
export function mapWindow(node: HTMLElement, params: { overlay: boolean } = { overlay: true }) {
  const destroy = trackRect(node, (rect) =>
    mapWindowStore.set(rect ? { ...rect, overlay: params.overlay } : null)
  );
  return { destroy };
}

// Registers the element's rect as the page shell the map redraws as one slab.
export function mapShell(node: HTMLElement) {
  const destroy = trackRect(node, (rect) => mapShellStore.set(rect));
  return { destroy };
}

// Registers the element's rect as an opaque panel the map redraws around its
// window, so a window inside a card still reads as part of that card.
export function mapPanel(node: HTMLElement) {
  const destroy = trackRect(node, (rect) => mapPanelStore.set(rect));
  return { destroy };
}
