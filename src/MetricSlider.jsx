import { useState, useRef, useEffect, useLayoutEffect } from 'react';

// Slider horizontal de N páginas navegable con drag de mouse/touch (Pointer Events), sin librerías
// externas. Página activa + drag en curso se posicionan en píxeles (medidos vía ResizeObserver) para
// evitar la ambigüedad de porcentajes anidados en un layout flex. La altura del contenedor se anima
// según el contenido de la página activa (páginas de alturas distintas).
// dragDisabled: apaga el swipe propio del slider. Necesario, por ejemplo, cuando el contenido de la
// página tiene su propio gesto de arrastre (arrastrar tarjetas para reordenarlas) — sin esto, ambos
// gestos escuchan el mismo pointermove y compiten, y la tarjeta arrastrada "salta" junto con la página.
export default function MetricSlider({ darkMode, pages, initialIndex = 0, onIndexChange, ariaLabel = 'Panel', dragDisabled = false }) {
  const [index, setIndex] = useState(initialIndex);
  const [wrapperWidth, setWrapperWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Cuando el ancho cambia por un resize de ventana (no por swipe/click de página), hay que
  // reposicionar el track sin animar: si no, la transición de 380ms de "cambiar de página" se
  // dispara en cada tick del resize, y la página siguiente (ej. Proyección) queda un instante a
  // medio camino, visible de refilón — el "bug" al agrandar/achicar que se veía.
  const [suppressTransition, setSuppressTransition] = useState(false);

  const wrapperRef = useRef(null);
  const pageRefs = useRef([]);
  const dragState = useRef(null);
  const prevWidthRef = useRef(null);

  const count = pages.length;

  const goTo = (i) => {
    const clamped = Math.max(0, Math.min(count - 1, i));
    setIndex(clamped);
    onIndexChange?.(clamped);
  };

  // Medir ancho del wrapper (para posicionar el track en píxeles). OJO: este ResizeObserver
  // también se dispara cuando cambia el ALTO del wrapper (la altura se anima en cada navegación
  // entre páginas), no solo cuando cambia el ancho por un resize de ventana — por eso hay que
  // comparar contra el ancho anterior y suprimir la transición únicamente si el ancho en sí
  // cambió. Si no, cada navegación normal (que cambia el alto) se trataba como un "resize" y
  // apagaba la animación de la página a mitad de camino.
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const initialWidth = el.offsetWidth;
    setWrapperWidth(initialWidth);
    prevWidthRef.current = initialWidth;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (prevWidthRef.current !== null && newWidth !== prevWidthRef.current) {
          setSuppressTransition(true);
        }
        prevWidthRef.current = newWidth;
        setWrapperWidth(newWidth);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reactiva la transición recién en el frame siguiente a que el nuevo ancho ya se pintó sin
  // animar — así una navegación real (swipe/click de página) inmediatamente después sigue animada.
  // useLayoutEffect (no useEffect) para que el "transition:none" llegue a pintarse antes de
  // reactivarlo, sin dejar un frame de por medio donde se pueda colar una animación no deseada.
  useLayoutEffect(() => {
    if (!suppressTransition) return;
    const raf = requestAnimationFrame(() => setSuppressTransition(false));
    return () => cancelAnimationFrame(raf);
  }, [suppressTransition, wrapperWidth]);

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
    dragState.current = { startX: e.clientX, startY: e.clientY, intent: null, pointerId: e.pointerId };
    // OJO: la captura del puntero NO se pide acá. Pedirla en todo pointerdown redirige el click
    // resultante de un simple tap al wrapper (en vez de a la tarjeta tocada), rompiendo cualquier
    // onClick de los hijos (ej. las tarjetas de Inicio). Se pide recién en handlePointerMove, una
    // vez confirmado que el gesto es efectivamente un arrastre horizontal.
  };

  const handlePointerMove = (e) => {
    const state = dragState.current;
    if (!state) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;

    if (state.intent === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      state.intent = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      if (state.intent === 'horizontal') {
        setIsDragging(true);
        e.currentTarget.setPointerCapture?.(state.pointerId);
      }
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
          transition: (isDragging || suppressTransition) ? 'none' : 'height 300ms ease',
        }}
        {...(dragDisabled ? {} : {
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
        })}
      >
        <div
          className="flex items-start"
          style={{
            width: wrapperWidth ? `${wrapperWidth * count}px` : '100%',
            transform: `translateX(${-index * wrapperWidth + dragOffset}px)`,
            transition: (isDragging || suppressTransition) ? 'none' : 'transform 380ms cubic-bezier(0.22,1,0.36,1)',
            cursor: dragDisabled ? 'default' : (isDragging ? 'grabbing' : 'grab'),
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
