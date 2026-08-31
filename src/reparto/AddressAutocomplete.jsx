import { useState, useRef, useEffect } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { loadGoogleMaps } from './googleMapsLoader';
import { AUTOCOMPLETE_BIAS, sugerirZonaPorComponentesDireccion } from './zonas';

// Autocompletado de direcciones con Places API (New), restringido a Argentina y sesgado a
// CABA/GBA norte. No es un campo libre: onSelect solo se dispara al elegir una sugerencia de la
// lista, y solo ahí se resuelven lat/lng/placeId — nunca se puede "guardar" texto tipeado a mano.
//
// CRÍTICO — session tokens: un AutocompleteSessionToken por sesión de búsqueda. Se crea la primera
// vez que el usuario escribe algo, se reutiliza en cada tecla siguiente (así todas las llamadas de
// autocompletado de una misma búsqueda se facturan juntas, no una por tecla), y se descarta —
// creando uno nuevo recién la PRÓXIMA vez que haga falta — apenas se selecciona una dirección
// (fetchFields cierra la sesión) o se limpia el campo.
export default function AddressAutocomplete({ dm, value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gmapsReady, setGmapsReady] = useState(false);
  const sessionTokenRef = useRef(null);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);
  const placesLibRef = useRef(null);

  useEffect(() => {
    loadGoogleMaps()
      .then(async (maps) => {
        // La librería "places" nueva se importa aparte con importLibrary, aunque ya se haya
        // cargado el script con &libraries=places — así queda todo tipado/listo sin condiciones
        // de carrera si dos componentes la piden al mismo tiempo (Maps cachea la promesa interna).
        const places = await maps.importLibrary('places');
        placesLibRef.current = places;
        setGmapsReady(true);
      })
      .catch(err => console.error('Google Maps no cargó:', err));
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const getSessionToken = () => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLibRef.current.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  };

  const runSearch = async (input) => {
    if (!placesLibRef.current || input.trim().length < 4) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const { AutocompleteSuggestion } = placesLibRef.current;
      const request = {
        input,
        sessionToken: getSessionToken(),
        includedRegionCodes: ['ar'],
        locationBias: {
          center: { lat: AUTOCOMPLETE_BIAS.lat, lng: AUTOCOMPLETE_BIAS.lng },
          radius: AUTOCOMPLETE_BIAS.radiusMeters,
        },
      };
      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      setSuggestions(results || []);
      setOpen(true);
    } catch (err) {
      console.error('Error buscando direcciones:', err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (text) => {
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 300);
  };

  const handleSelect = async (suggestion) => {
    setOpen(false);
    setLoading(true);
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ['location', 'formattedAddress', 'id', 'addressComponents'] });
      onChange(place.formattedAddress || suggestion.placePrediction.text.toString());
      // Prueba TODOS los address_components devueltos (no solo el que venga tageado como barrio —
      // para direcciones de Argentina esa etiqueta no siempre es consistente) contra el mapeo de
      // zonas.js — si ninguno matchea un barrio conocido, queda sin sugerir y se elige a mano.
      const zonaSugerida = sugerirZonaPorComponentesDireccion(place.addressComponents);
      onSelect({
        texto: place.formattedAddress || '',
        lat: place.location?.lat() ?? null,
        lng: place.location?.lng() ?? null,
        placeId: place.id || null,
        zonaSugerida,
      });
    } catch (err) {
      console.error('Error resolviendo la dirección elegida:', err);
    } finally {
      // Sesión cerrada: la próxima búsqueda arranca con un token nuevo.
      sessionTokenRef.current = null;
      setSuggestions([]);
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          {loading ? <Loader2 size={16} className={`animate-spin ${dm ? 'text-zinc-500' : 'text-zinc-400'}`} /> : <Search size={16} className={dm ? 'text-zinc-500' : 'text-zinc-400'} />}
        </div>
        <input
          value={value}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={gmapsReady ? 'Escribí la calle y altura...' : 'Cargando mapas...'}
          disabled={!gmapsReady}
          className={`h-12 border rounded-xl pl-9 pr-3.5 w-full text-base outline-none transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 placeholder-zinc-600 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:ring-1 focus:ring-blue-100'} disabled:opacity-50`}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className={`absolute z-20 mt-1 w-full rounded-xl border shadow-xl max-h-64 overflow-y-auto custom-scrollbar ${dm ? 'bg-[#181818] border-white/[0.1]' : 'bg-white border-zinc-200'}`}>
          {suggestions.map((s, i) => {
            const pred = s.placePrediction;
            return (
              <button key={pred.placeId || i} type="button" onClick={() => handleSelect(s)}
                className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors flex items-start gap-2 ${dm ? 'hover:bg-white/[0.06] text-zinc-200' : 'hover:bg-zinc-50 text-zinc-800'}`}>
                <MapPin size={14} className={`mt-0.5 flex-shrink-0 ${dm ? 'text-zinc-500' : 'text-zinc-400'}`} />
                <span>{pred.text.toString()}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
