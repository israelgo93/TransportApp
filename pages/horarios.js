// pages/horarios.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { navigateTo } from '../lib/navigationService';
import { useAuth } from '../lib/AuthContext'; // Contexto centralizado de auth

// Constantes al inicio del archivo
const CACHE_TTL = 60000; // 1 minuto

// Hook personalizado para obtener parámetros de ruta
function useParams() {
  if (typeof window === 'undefined') {
    return { query: {} };
  }
  const router = require('next/router').useRouter();
  return router.query || {};
}

export default function Horarios() {
  // Estados para manejar la carga y datos
  const [loading, setLoading] = useState(true);
  const [detallesRuta, setDetallesRuta] = useState(null);
  const [horarios, setHorarios] = useState([]);
  const [error, setError] = useState(null);
  
  // Obtener parámetros de la URL
  const { ruta, fecha } = useParams();
  
  // Usar contexto de autenticación centralizado
  const { user, loading: authLoading } = useAuth();

  // Cache para evitar recalcular disponibilidad frecuentemente
  const disponibilidadCache = useMemo(() => new Map(), []);

  // Función para formatear hora (memoizada)
  const formatHora = useCallback((horaStr) => {
    if (!horaStr) return '';
    
    // Convertir formato "HH:MM:SS" a "HH:MM AM/PM"
    const [hora, minuto] = horaStr.split(':');
    let h = parseInt(hora);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; // Convertir a formato 12 horas
    return `${h}:${minuto} ${ampm}`;
  }, []);

  // Función para manejar clic en botón reservar (memoizada)
  const handleReservar = useCallback((horarioId) => {
    if (authLoading) return; // Evitar redirecciones durante carga
    
    if (!user) {
      toast.error('Debes iniciar sesión para reservar');
      navigateTo(`/login?redirect=/horarios?ruta=${ruta}&fecha=${fecha}`);
      return;
    }

    navigateTo(`/reservar?horario=${horarioId}&fecha=${fecha}`);
  }, [user, authLoading, ruta, fecha]);

  // Componentes de estado memoizados
  const loadingContent = useMemo(() => (
    <div className="flex justify-center items-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4">Cargando horarios disponibles...</p>
      </div>
    </div>
  ), []);

  const errorContent = useMemo(() => (
    <div className="text-center py-10">
      <h2 className="text-2xl font-bold mb-4">Error</h2>
      <p className="mb-4 text-red-500">{error}</p>
      <Link href="/" className="text-primary hover:underline">
        Volver al inicio
      </Link>
    </div>
  ), [error]);

  const notFoundContent = useMemo(() => (
    <div className="text-center py-10">
      <h2 className="text-2xl font-bold mb-4">Ruta no encontrada</h2>
      <p className="mb-4">La ruta solicitada no existe o no está disponible.</p>
      <Link href="/" className="text-primary hover:underline">
        Volver al inicio
      </Link>
    </div>
  ), []);

  // Función para cargar datos de la ruta y horarios
  const fetchData = useCallback(async () => {
    if (!ruta || !fecha) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Verificar caché para este conjunto de datos
      const cacheKey = `${ruta}-${fecha}`;
      const cachedData = disponibilidadCache.get(cacheKey);
      
      if (cachedData && (Date.now() - cachedData.timestamp < CACHE_TTL)) {
        console.log(`Usando datos en caché para ruta: ${ruta}, fecha: ${fecha}`);
        setDetallesRuta(cachedData.detallesRuta);
        setHorarios(cachedData.horarios);
        setLoading(false);
        return;
      }
      
      // 1. Obtener detalles de la ruta
      const { data: rutaData, error: rutaError } = await supabase
        .from('rutas')
        .select('*')
        .eq('id', ruta)
        .single();

      if (rutaError) {
        console.error('Error al cargar datos de ruta:', rutaError);
        throw rutaError;
      }
      
      setDetallesRuta(rutaData);
      console.log(`Ruta cargada: ${rutaData.origen} → ${rutaData.destino}`);

      // 2. Obtener horarios disponibles
      const diaSemana = new Date(fecha).toLocaleString('es', { weekday: 'long' }).toLowerCase();
      
      const { data: horariosData, error: horariosError } = await supabase
        .from('horarios')
        .select(`
          id, 
          hora_salida, 
          precio,
          dias_operacion,
          buses:bus_id (id, numero, capacidad, tipo, caracteristicas)
        `)
        .eq('ruta_id', ruta)
        .contains('dias_operacion', [diaSemana]);

      if (horariosError) {
        console.error('Error al cargar horarios:', horariosError);
        throw horariosError;
      }
      
      console.log(`${horariosData.length} horarios encontrados para el día ${diaSemana}`);

      // 3. Verificar disponibilidad de asientos para cada horario
      const horariosConDisponibilidad = await Promise.all(horariosData.map(async (horario) => {
        try {
          // Buscar reservaciones para este horario y fecha
          const { data: reservaciones, error: reservacionesError } = await supabase
            .from('reservaciones')
            .select(`
              id,
              detalles_reservacion (
                id,
                asiento_id
              )
            `)
            .eq('horario_id', horario.id)
            .eq('fecha_viaje', fecha)
            .in('estado', ['Pendiente', 'Confirmada']);

          if (reservacionesError) {
            console.warn('Error al verificar reservaciones:', reservacionesError);
            // Continuamos con 0 reservaciones en lugar de fallar
            return {
              ...horario,
              asientosDisponibles: horario.buses.capacidad,
              asientosReservados: 0
            };
          }

          // Contar asientos reservados
          const asientosReservados = reservaciones.reduce((total, reserva) => {
            return total + (reserva.detalles_reservacion?.length || 0);
          }, 0);

          // Calcular asientos disponibles
          const asientosDisponibles = horario.buses.capacidad - asientosReservados;

          return {
            ...horario,
            asientosDisponibles,
            asientosReservados
          };
        } catch (error) {
          console.error(`Error al procesar horario ${horario.id}:`, error);
          // En caso de error, asumimos que todos los asientos están disponibles
          return {
            ...horario,
            asientosDisponibles: horario.buses.capacidad,
            asientosReservados: 0,
            error: true
          };
        }
      }));

      // Ordenar horarios por hora de salida
      const horariosSorted = horariosConDisponibilidad.sort((a, b) => 
        a.hora_salida.localeCompare(b.hora_salida)
      );
      
      setHorarios(horariosSorted);
      console.log(`${horariosSorted.length} horarios procesados con disponibilidad`);
      
      // Guardar en caché
      disponibilidadCache.set(cacheKey, {
        timestamp: Date.now(),
        detallesRuta: rutaData,
        horarios: horariosSorted
      });
      
      // Limpiar entradas antiguas del caché
      const now = Date.now();
      disponibilidadCache.forEach((value, key) => {
        if (now - value.timestamp > CACHE_TTL) {
          disponibilidadCache.delete(key);
        }
      });
    } catch (error) {
      console.error('Error al cargar datos:', error);
      setError('Error al cargar horarios');
      toast.error('Error al cargar horarios');
    } finally {
      setLoading(false);
    }
  }, [ruta, fecha, disponibilidadCache]);

  // Efecto para cargar datos de la ruta y horarios
  useEffect(() => {
    // Solo ejecutar si ruta y fecha están disponibles
    if (!ruta || !fecha) return;

    // Cargar datos de la ruta y horarios
    fetchData();
  }, [ruta, fecha, fetchData]); // Incluir fetchData como dependencia

  // Mostrar pantalla de carga
  if (loading) {
    return loadingContent;
  }

  // Mostrar error si ocurrió alguno
  if (error) {
    return errorContent;
  }

  // Mostrar mensaje si no se encontró la ruta
  if (!detallesRuta) {
    return notFoundContent;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-primary hover:underline flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Volver a la búsqueda
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-2xl font-bold mb-4">
          {detallesRuta.origen} → {detallesRuta.destino}
        </h1>
        <p className="text-gray-600 mb-2">
          <span className="font-medium">Fecha de viaje:</span> {new Date(fecha).toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <p className="text-gray-600">
          <span className="font-medium">Distancia:</span> {detallesRuta.distancia} km | 
          <span className="font-medium"> Duración estimada:</span> {Math.floor(detallesRuta.duracion_estimada / 60)}h {detallesRuta.duracion_estimada % 60}min
        </p>
      </div>

      {horarios.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-lg mb-4">No hay horarios disponibles para esta ruta en la fecha seleccionada.</p>
          <Link href="/" className="text-primary hover:underline">
            Seleccionar otra fecha o ruta
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <h2 className="text-lg font-semibold p-4 bg-gray-100 border-b">
            Horarios disponibles ({horarios.length})
          </h2>
          
          <div className="divide-y">
            {horarios.map((horario) => (
              <div key={horario.id} className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <div>
                    <p className="text-lg font-medium">{formatHora(horario.hora_salida)}</p>
                    <p className="text-gray-600">Bus #{horario.buses.numero} - {horario.buses.tipo}</p>
                  </div>
                  <div className="mt-2 md:mt-0">
                    <p className="text-lg font-bold text-primary">${horario.precio.toFixed(2)}</p>
                  </div>
                </div>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between mt-3">
                  <div>
                    <p className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      horario.asientosDisponibles > 10
                        ? 'bg-green-100 text-green-800'
                        : horario.asientosDisponibles > 0
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {horario.asientosDisponibles} {horario.asientosDisponibles === 1 ? 'asiento disponible' : 'asientos disponibles'}
                    </p>
                    
                    <div className="mt-2 text-sm text-gray-600">
                      <span className="font-medium">Comodidades:</span> 
                      {Object.entries(horario.buses.caracteristicas || {})
                        .filter(([_, valor]) => valor === true)
                        .map(([clave]) => clave)
                        .join(', ')}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleReservar(horario.id)}
                    disabled={horario.asientosDisponibles <= 0}
                    className={`mt-3 md:mt-0 px-4 py-2 rounded transition ${
                      horario.asientosDisponibles > 0
                        ? 'bg-primary text-white hover:bg-opacity-90'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {horario.asientosDisponibles > 0 ? 'Reservar' : 'No disponible'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}