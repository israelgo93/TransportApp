import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

export default function Home() {
  const router = useRouter();
  const [rutas, setRutas] = useState([]);
  const [rutaSeleccionada, setRutaSeleccionada] = useState('');
  const [fechaViaje, setFechaViaje] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRutas = async () => {
      const { data, error } = await supabase
        .from('rutas')
        .select('id, origen, destino')
        .order('origen');

      if (error) {
        console.error('Error al cargar rutas:', error);
      } else {
        setRutas(data || []);
      }
      setLoading(false);
    };

    fetchRutas();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (rutaSeleccionada && fechaViaje) {
      router.push(`/horarios?ruta=${rutaSeleccionada}&fecha=${fechaViaje}`);
    }
  };

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
              >
                <option value="">Seleccione origen y destino</option>
                {rutas.map((ruta) => (
                  <option key={ruta.id} value={ruta.id}>
                    {ruta.origen} → {ruta.destino}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-gray-700 mb-2">Fecha de viaje</label>
              <input
                type="date"
                value={fechaViaje}
                onChange={(e) => setFechaViaje(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-primary text-white p-3 rounded-md hover:bg-opacity-90 transition duration-200"
            >
              Buscar Horarios
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {['Quito', 'Guayaquil', 'Cuenca', 'Manta'].map((ciudad) => (
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