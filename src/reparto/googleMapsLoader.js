// Carga perezosa del script de Google Maps JS API (Maps + Places New + marcadores avanzados).
// Un solo <script> para toda la app, sin importar cuántos componentes lo pidan: la promesa se
// cachea en el módulo, así que la segunda vez que alguien llama loadGoogleMaps() recibe la misma
// promesa ya resuelta (o en curso) en vez de inyectar el script de nuevo.
//
// La API key SIEMPRE sale de la variable de entorno — nunca hardcodeada acá ni en ningún otro lado.

let loadPromise = null;

export function loadGoogleMaps() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('loadGoogleMaps solo puede correr en el navegador'));
      return;
    }
    if (window.google?.maps?.places) {
      resolve(window.google.maps);
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY en el entorno'));
      return;
    }

    const callbackName = '__gmapsLoaderCallback028';
    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google.maps);
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,marker&v=weekly&loading=async&callback=${callbackName}&language=es-AR&region=AR`;
    script.async = true;
    script.onerror = () => reject(new Error('No se pudo cargar el script de Google Maps'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

// Estilo oscuro para el mapa (mismo lenguaje visual "dark glassmorphism" del resto de la app —
// fondo casi negro, calles sutiles, sin el ruido de POIs comerciales que no aportan acá).
export const MAP_DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#131316' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#131316' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7a7a85' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2a30' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#232328' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a1e' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c2c33' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a94' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1420' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a5a70' }] },
];
