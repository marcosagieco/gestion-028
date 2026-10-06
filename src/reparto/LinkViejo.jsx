// Cartel para /reparto, el link de cuando había un solo motomensajero.
//
// No muestra ningún dato a propósito: ahora cada reparto tiene su propio link (ver
// reparto/repartidores.js) y si este siguiera mostrando un recorrido, cualquiera de los dos podría
// entrar por acá y ver las paradas del otro — justo lo que se quiso evitar al separarlos.
export default function LinkViejo() {
  const oscuro = (() => {
    try { return localStorage.getItem('028_dark_mode') === 'true'; } catch { return false; }
  })();
  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${oscuro ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className={`w-full max-w-sm rounded-3xl border p-7 text-center ${oscuro ? 'bg-[#101010] border-white/[0.07]' : 'bg-white border-zinc-200'}`}>
        <p className="text-4xl mb-3">🛵</p>
        <p className="text-lg font-black leading-tight">Este link ya no se usa</p>
        <p className={`text-sm mt-2 leading-snug ${oscuro ? 'text-zinc-400' : 'text-zinc-600'}`}>
          Ahora cada reparto tiene su propio link. Pedile el tuyo al depósito y guardalo en el celular.
        </p>
      </div>
    </div>
  );
}
