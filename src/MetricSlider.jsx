import { useState, useRef, useEffect, useLayoutEffect } from 'react';

// Slider horizontal de N páginas navegable con drag de mouse/touch (Pointer Events), sin librerías
// externas. Página activa + drag en curso se posicionan en píxeles (medidos vía ResizeObserver) para
// evitar la ambigüedad de porcentajes anidados en un layout flex. La altura del contenedor se anima
// según el contenido de la página activa (páginas de alturas distintas).
export default function MetricSlider({ darkMode, pages, initialIndex = 0, onIndexChange, ariaLabel = 'Panel' }) {
  const [index, setIndex] = useState(initialIndex);
  const [wrapperWidth, setWrapperWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const wrapperRef = useRef(null);
  const pageRefs = useRef([]);
  const dragState = useRef(null);

  const count = pages.length;

  const goTo = (i) => {
    const clamped = Math.max(0, Math.min(count - 1, i));
    setIndex(clamped);
    onIndexChange?.(clamped);
  };

  // Medir ancho del wrapper (para posicionar el track en píxeles)
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    setWrapperWidth(el.offsetWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWrapperWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Medir y animar la altura según el contenido de la página activa
  useLayoutEffect(() => {
    const el = pageRefs.current[index];
    if (el) setContainerHeight(el.offsetHeight);
  }, [index, pages, wrapperWidth]);

  useEffect(() => {
    const el = pageRefs.current[index];
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [index]);

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, intent: null };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const state = dragState.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    if (state.intent === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      state.intent = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      if (state.intent === 'horizontal') setIsDragging(true);
    }
    if (state.intent !== 'horizontal') return;

    let offset = dx;
    const atFirst = index === 0 && offset > 0;
    const atLast = index === count - 1 && offset < 0;
    if (atFirst || atLast) offset *= 0.35; // resistencia en los bordes
    setDragOffset(offset);
  };

  const endDrag = () => {
    const state = dragState.current;
    if (state?.intent === 'horizontal') {
      const threshold = wrapperWidth * 0.15;
      if (dragOffset <= -threshold) goTo(index + 1);
      else if (dragOffset >= threshold) goTo(index - 1);
    }
    dragState.current = null;
    setIsDragging(false);
    setDragOffset(0);
  };

  return (
    <div className="w-full">
      <div
        ref={wrapperRef}
        className="relative w-full overflow-hidden select-none touch-pan-y"
        style={{
          height: containerHeight != null ? `${containerHeight}px` : 'auto',
          transition: isDragging ? 'none' : 'height 300ms ease',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="flex items-start"
          style={{
            width: wrapperWidth ? `${wrapperWidth * count}px` : '100%',
            transform: `translateX(${-index * wrapperWidth + dragOffset}px)`,
            transition: isDragging ? 'none' : 'transform 380ms cubic-bezier(0.22,1,0.36,1)',
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
        >
          {pages.map((page, i) => (
            <div
              key={page.id}
              ref={(el) => { pageRefs.current[i] = el; }}
              className="flex-shrink-0"
              style={{ width: wrapperWidth ? `${wrapperWidth}px` : '100%' }}
            >
              {page.content}
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {pages.map((page, i) => (
            <button
              key={page.id}
              type="button"
              aria-label={`Ir a página ${i + 1} de ${ariaLabel}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? 'w-5 bg-[#fcdb00]' : `w-1.5 ${darkMode ? 'bg-white/20 hover:bg-white/30' : 'bg-zinc-300 hover:bg-zinc-400'}`
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
