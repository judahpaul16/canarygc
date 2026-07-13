export interface Point {
	left: number;
	top: number;
}

// Keeps a panel of the given size fully on screen with a margin, so a dragged
// or reflowed dock never lands off the viewport edge.
export function clampToViewport(
	left: number,
	top: number,
	width: number,
	height: number,
	viewportWidth: number,
	viewportHeight: number,
	margin = 8
): Point {
	const maxLeft = Math.max(margin, viewportWidth - width - margin);
	const maxTop = Math.max(margin, viewportHeight - height - margin);
	return {
		left: Math.min(Math.max(margin, left), maxLeft),
		top: Math.min(Math.max(margin, top), maxTop)
	};
}

interface DraggableOptions {
	// Selector for the drag handle within the node; a press elsewhere is ignored.
	handle?: string;
	// Position to apply on mount (a previously dragged spot); null keeps the CSS
	// default corner in place.
	initial?: Point | null;
	onEnd?: (pos: Point) => void;
}

// Drags a floating panel by its handle with pointer events, writing left/top
// inline and clamping to the viewport. The handle test runs per press (rather
// than caching an element) so a panel that swaps its header for a collapsed
// pill still drags after it re-expands. Presses on inner controls (buttons,
// inputs, links) never start a drag, so those keep working.
export function draggable(node: HTMLElement, options: DraggableOptions = {}) {
	let opts = options;
	let startX = 0;
	let startY = 0;
	let startLeft = 0;
	let startTop = 0;
	let dragging = false;

	function applyInitial(pos: Point | null | undefined) {
		if (!pos) return;
		const clamped = clampToViewport(
			pos.left,
			pos.top,
			node.offsetWidth,
			node.offsetHeight,
			window.innerWidth,
			window.innerHeight
		);
		place(clamped);
	}

	function place(pos: Point) {
		node.style.left = `${pos.left}px`;
		node.style.top = `${pos.top}px`;
		node.style.right = 'auto';
		node.style.bottom = 'auto';
	}

	function onPointerDown(e: PointerEvent) {
		const target = e.target as HTMLElement;
		if (opts.handle && !target.closest(opts.handle)) return;
		if (target.closest('button, input, select, a, textarea')) return;
		const rect = node.getBoundingClientRect();
		startX = e.clientX;
		startY = e.clientY;
		startLeft = rect.left;
		startTop = rect.top;
		dragging = true;
		node.classList.add('dragging');
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		e.preventDefault();
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		place(
			clampToViewport(
				startLeft + (e.clientX - startX),
				startTop + (e.clientY - startY),
				node.offsetWidth,
				node.offsetHeight,
				window.innerWidth,
				window.innerHeight
			)
		);
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;
		node.classList.remove('dragging');
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		const rect = node.getBoundingClientRect();
		opts.onEnd?.({ left: rect.left, top: rect.top });
	}

	applyInitial(opts.initial);
	node.addEventListener('pointerdown', onPointerDown);

	return {
		update(next: DraggableOptions) {
			opts = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
		}
	};
}
