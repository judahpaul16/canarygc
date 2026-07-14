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
  // A viewport resize reads the rect mid-reflow (a vh-sized centered layout
  // settles across several frames after the resize event), and a fixed-size
  // element never refires its own ResizeObserver, so a mid-reflow rect would
  // stick. After a resize, republish every frame until the rect holds still,
  // so the settled position lands no matter how long the layout takes.
  const SETTLE_STABLE_FRAMES = 3;
  const SETTLE_MAX_MS = 1500;
  let settleRaf = 0;
  function settleTrack() {
    cancelAnimationFrame(settleRaf);
    let lastTop = NaN;
    let lastLeft = NaN;
    let stable = 0;
    const deadline = performance.now() + SETTLE_MAX_MS;
    const step = () => {
      const r = node.getBoundingClientRect();
      if (r.top === lastTop && r.left === lastLeft) {
        stable++;
      } else {
        stable = 0;
        lastTop = r.top;
        lastLeft = r.left;
        update();
      }
      if (stable < SETTLE_STABLE_FRAMES && performance.now() < deadline) {
        settleRaf = requestAnimationFrame(step);
      }
    };
    settleRaf = requestAnimationFrame(step);
  }
  function onResize() {
    update();
    settleTrack();
  }
  const observer = new ResizeObserver(onResize);
  observer.observe(node);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', scheduleUpdate, true);
  update();
  return () => {
    if (scheduled) cancelAnimationFrame(scheduled);
    cancelAnimationFrame(settleRaf);
    observer.disconnect();
    window.removeEventListener('resize', onResize);
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
