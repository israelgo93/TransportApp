// pages/index.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { navigateTo } from '../lib/navigationService';

export default function Home() {
  // Estados para el formulario y datos
  const [rutas, setRutas] = useState([]);
  const [rutaSeleccionada, setRutaSeleccionada] = useState('');
  const [fechaViaje, setFechaViaje] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingRutas, setLoadingRutas] = useState(true);
  
  // Definir la fecha mínima seleccionable (hoy)
  const fechaMinima = useMemo(() => new Date().toISOString().split('T')[0], []);
  
  // Establecer la fecha por defecto (mañana)
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFechaViaje(tomorrow.toISOString().split('T')[0]);
  }, []);

  // Función para cargar rutas desde la base de datos
  const fetchRutas = useCallback(async () => {
    setLoadingRutas(true);
    
    try {
      // Intentar obtener datos desde sessionStorage primero
      const cachedData = sessionStorage.getItem('rutasCache');
      const cacheTimestamp = sessionStorage.getItem('rutasCacheTimestamp');
      
      // Comprobar si el caché es válido (menos de 1 hora)
      const now = Date.now();
      const cacheValid = cacheTimestamp && (now - parseInt(cacheTimestamp) < 3600000);
      
      if (cachedData && cacheValid) {
        console.log('Usando rutas en caché');
        setRutas(JSON.parse(cachedData));
        setLoadingRutas(false);
        return;
      }
      
      console.log('Cargando rutas desde la base de datos');
      const { data, error } = await supabase
        .from('rutas')
        .select('id, origen, destino')
        .order('origen');

      if (error) {
        console.error('Error al cargar rutas:', error);
        toast.error('Error al cargar rutas disponibles');
        setRutas([]);
      } else {
        // Guardar en el estado y en caché
        setRutas(data || []);
        
        // Almacenar en sessionStorage
        try {
          sessionStorage.setItem('rutasCache', JSON.stringify(data));
          sessionStorage.setItem('rutasCacheTimestamp', now.toString());
        } catch (e) {
          console.warn('Error al guardar en sessionStorage:', e);
        }
      }
    } catch (error) {
      console.error('Error inesperado al cargar rutas:', error);
      setRutas([]);
    } finally {
      setLoadingRutas(false);
      setLoading(false);
    }
  }, []);

  // Cargar rutas al montar el componente
  useEffect(() => {
    fetchRutas();
  }, [fetchRutas]);

  // Manejar envío del formulario (memoizado)
  const handleSearch = useCallback((e) => {
    e.preventDefault();
    
    // Validar datos de entrada
    if (!rutaSeleccionada) {
      toast.error('Por favor selecciona una ruta');
      return;
    }
    
    if (!fechaViaje) {
      toast.error('Por favor selecciona una fecha de viaje');
      return;
    }
    
    // Comparar con la fecha mínima
    if (fechaViaje < fechaMinima) {
      toast.error('No puedes seleccionar fechas pasadas');
      return;
    }
    
    // Todo correcto, navegar a la página de horarios
    navigateTo(`/horarios?ruta=${rutaSeleccionada}&fecha=${fechaViaje}`);
  }, [rutaSeleccionada, fechaViaje, fechaMinima]);

  // Componentes de UI memoizados
  const destinosPopulares = useMemo(() => [
    'Quito', 'Guayaquil', 'Cuenca', 'Manta', 'Santo Domingo', 'Ambato', 'Loja'
  ], []);

  // Lista de rutas memoizada y ordenada
  const rutasOrdenadas = useMemo(() => {
    // Agrupar por origen para facilitar la selección
    if (!rutas.length) return [];
    
    // Crear objeto que agrupe rutas por origen
    const rutasPorOrigen = rutas.reduce((acc, ruta) => {
      const origen = ruta.origen;
      if (!acc[origen]) {
        acc[origen] = [];
      }
      acc[origen].push(ruta);
      return acc;
    }, {});
    
    // Ordenar cada grupo por destino
    Object.keys(rutasPorOrigen).forEach(origen => {
      rutasPorOrigen[origen].sort((a, b) => a.destino.localeCompare(b.destino));
    });
    
    // Devolver un array plano para el selector
    return Object.keys(rutasPorOrigen).sort().flatMap(origen => {
      return rutasPorOrigen[origen];
    });
  }, [rutas]);

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-4xl bg-white rounded-lg shadow-lg overflow-hidden mb-10">
        {/* Banner o imagen principal */}
        <div className="bg-blue-600 p-10 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">
            Viaja seguro por Ecuador
          </h1>
          <p className="text-xl text-white">
            Reserva tu pasaje en línea y disfruta de un viaje cómodo
          </p>
        </div>

        {/* Formulario de búsqueda */}
        <div className="p-6">
          <h2 className="text-2xl font-semibold mb-4 text-center">
            Encuentra tu ruta
          </h2>
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-gray-700 mb-2">Selecciona tu ruta</label>
              <select
                value={rutaSeleccionada}
                onChange={(e) => setRutaSeleccionada(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                required
                disabled={loadingRutas}
              >
                <option value="">Seleccione origen y destino</option>
                {rutasOrdenadas.map((ruta) => (
                  <option key={ruta.id} value={ruta.id}>
                    {ruta.origen} → {ruta.destino}
                  </option>
                ))}
              </select>
              {loadingRutas && (
                <p className="text-sm text-gray-500 mt-1">Cargando rutas disponibles...</p>
              )}
            </div>

            <div>
              <label className="block text-gray-700 mb-2">Fecha de viaje</label>
              <input
                type="date"
                value={fechaViaje}
                onChange={(e) => setFechaViaje(e.target.value)}
                min={fechaMinima}
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-primary text-white p-3 rounded-md hover:bg-opacity-90 transition duration-200"
              disabled={loadingRutas}
            >
              {loadingRutas ? 'Cargando...' : 'Buscar Horarios'}
            </button>
          </form>
        </div>
      </div>

      {/* Sección de beneficios */}
      <div className="w-full max-w-4xl mb-10">
        <h2 className="text-2xl font-semibold mb-6 text-center">
          ¿Por qué viajar con nosotros?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2 text-primary">Seguridad</h3>
            <p className="text-gray-600">
              Todos nuestros buses cuentan con estrictos protocolos de seguridad y mantenimiento.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2 text-primary">Comodidad</h3>
            <p className="text-gray-600">
              Disfruta de asientos cómodos, aire acondicionado y WiFi en la mayoría de nuestras unidades.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2 text-primary">Facilidad</h3>
            <p className="text-gray-600">
              Reserva en línea, paga con tarjeta y recibe tu boleto electrónico sin complicaciones.
            </p>
          </div>
        </div>
      </div>

      {/* Sección de destinos populares */}
      <div className="w-full max-w-4xl">
        <h2 className="text-2xl font-semibold mb-6 text-center">
          Destinos populares
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {destinosPopulares.map((ciudad) => (
            <div
              key={ciudad}
              className="bg-gray-200 p-4 rounded-lg text-center hover:bg-gray-300 transition duration-200"
            >
              <Link href={`/destino/${ciudad.toLowerCase()}`} className="text-lg font-medium">
                {ciudad}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}