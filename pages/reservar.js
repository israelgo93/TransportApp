// pages/reservar.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { navigateTo } from '../lib/navigationService';
import { useAuth } from '../lib/AuthContext'; // Contexto centralizado de auth

// Hook personalizado para obtener parámetros de ruta
function useParams() {
  if (typeof window === 'undefined') {
    return { query: {} }; 
  }
  const router = require('next/router').useRouter();
  return router.query || {};
}

export default function Reservar() {
  // Obtener parámetros de la URL
  const { horario, fecha } = useParams();
  
  // Estados para manejar la carga y datos
  const [loading, setLoading] = useState(true);
  const [procesandoReserva, setProcesandoReserva] = useState(false);
  const [horarioData, setHorarioData] = useState(null);
  const [rutaData, setRutaData] = useState(null);
  const [busData, setBusData] = useState(null);
  const [asientos, setAsientos] = useState([]);
  const [asientosSeleccionados, setAsientosSeleccionados] = useState([]);
  const [asientosReservados, setAsientosReservados] = useState([]);
  const [error, setError] = useState(null);
  
  // Usar contexto de autenticación centralizado
  const { user, loading: authLoading } = useAuth();

  // Manejar selección de asientos (memoizado)
  const toggleAsiento = useCallback((asientoId) => {
    // No permitir seleccionar asientos ya reservados
    if (asientosReservados.includes(asientoId)) {
      return;
    }

    setAsientosSeleccionados(prev => {
      if (prev.includes(asientoId)) {
        return prev.filter(id => id !== asientoId);
      } else {
        return [...prev, asientoId];
      }
    });
  }, [asientosReservados]);

  // Función para cargar datos iniciales
  const fetchInitialData = useCallback(async () => {
    if (!horario || !fecha || !user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Obtener datos del horario
      const { data: horarioData, error: horarioError } = await supabase
        .from('horarios')
        .select(`
          id, 
          hora_salida, 
          precio,
          ruta_id,
          bus_id
        `)
        .eq('id', horario)
        .single();

      if (horarioError) {
        console.error('Error al cargar horario:', horarioError);
        throw horarioError;
      }
      
      setHorarioData(horarioData);
      console.log(`Horario cargado: ${horarioData.id}`);

      // Obtener datos de la ruta
      const { data: rutaData, error: rutaError } = await supabase
        .from('rutas')
        .select('*')
        .eq('id', horarioData.ruta_id)
        .single();

      if (rutaError) {
        console.error('Error al cargar ruta:', rutaError);
        throw rutaError;
      }
      
      setRutaData(rutaData);
      console.log(`Ruta cargada: ${rutaData.origen} → ${rutaData.destino}`);

      // Obtener datos del bus
      const { data: busData, error: busError } = await supabase
        .from('buses')
        .select('*')
        .eq('id', horarioData.bus_id)
        .single();

      if (busError) {
        console.error('Error al cargar bus:', busError);
        throw busError;
      }
      
      setBusData(busData);
      console.log(`Bus cargado: ${busData.numero}`);

      // Obtener todos los asientos del bus
      const { data: asientosData, error: asientosError } = await supabase
        .from('asientos')
        .select('*')
        .eq('bus_id', horarioData.bus_id)
        .order('numero');

      if (asientosError) {
        console.error('Error al cargar asientos:', asientosError);
        throw asientosError;
      }
      
      setAsientos(asientosData);
      console.log(`${asientosData.length} asientos cargados`);

      // Obtener asientos ya reservados para este horario y fecha
      const { data: reservaciones, error: reservacionesError } = await supabase
        .from('reservaciones')
        .select(`
          id,
          detalles_reservacion (
            id,
            asiento_id
          )
        `)
        .eq('horario_id', horarioData.id)
        .eq('fecha_viaje', fecha)
        .in('estado', ['Pendiente', 'Confirmada']);

      if (reservacionesError) {
        console.error('Error al cargar reservaciones:', reservacionesError);
        throw reservacionesError;
      }

      // Extraer IDs de asientos reservados
      const asientosReservadosIds = [];
      reservaciones.forEach(reserva => {
        if (reserva.detalles_reservacion) {
          reserva.detalles_reservacion.forEach(detalle => {
            asientosReservadosIds.push(detalle.asiento_id);
          });
        }
      });

      setAsientosReservados(asientosReservadosIds);
      console.log(`${asientosReservadosIds.length} asientos ya reservados`);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      setError('Error al cargar información del viaje');
      toast.error('Error al cargar información del viaje');
    } finally {
      setLoading(false);
    }
  }, [horario, fecha, user]);

  // Efecto para verificar autenticación
  useEffect(() => {
    // Solo ejecutar si horario y fecha están disponibles y tenemos información de autenticación
    if (!horario || !fecha || authLoading) return;

    // Si no hay usuario después de verificar autenticación, redirigir a login
    if (!user && !authLoading) {
      toast.error('Debes iniciar sesión para reservar');
      navigateTo(`/login?redirect=${encodeURIComponent(`/reservar?horario=${horario}&fecha=${fecha}`)}`);
      return;
    }
    
    // Cargar datos iniciales
    fetchInitialData();
  }, [horario, fecha, user, authLoading, fetchInitialData]);

  // Función para crear reservación (memoizada)
  const crearReservacion = useCallback(async () => {
    if (asientosSeleccionados.length === 0) {
      toast.error('Debes seleccionar al menos un asiento');
      return;
    }

    if (procesandoReserva) {
      return; // Evitar múltiples envíos
    }

    setProcesandoReserva(true);

    try {
      // Generar código de referencia único
      const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      const referenceCode = `RES-${uniqueSuffix.toUpperCase()}`;
      
      console.log(`Creando reservación con referencia: ${referenceCode}`);
      
      // Crear la reservación
      const { data: reservacion, error: reservacionError } = await supabase
        .from('reservaciones')
        .insert([{
          usuario_id: user.id,
          horario_id: horarioData.id,
          fecha_viaje: fecha,
          estado: 'Pendiente',
          reference_code: referenceCode,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (reservacionError) {
        console.error('Error al crear reservación:', reservacionError);
        throw reservacionError;
      }
      
      console.log(`Reservación creada: ${reservacion.id}`);

      // Crear detalles de la reservación (asientos)
      const detallesReservacion = asientosSeleccionados.map(asientoId => ({
        reservacion_id: reservacion.id,
        asiento_id: asientoId,
        precio: horarioData.precio,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error: detallesError } = await supabase
        .from('detalles_reservacion')
        .insert(detallesReservacion);

      if (detallesError) {
        console.error('Error al crear detalles de reservación:', detallesError);
        throw detallesError;
      }
      
      console.log(`${detallesReservacion.length} detalles de reservación creados`);

      // Crear registro de pago
      const montoTotal = horarioData.precio * asientosSeleccionados.length;
      
      const { error: pagoError } = await supabase
        .from('pagos')
        .insert([{
          reservacion_id: reservacion.id,
          monto: montoTotal,
          estado: 'Pendiente',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (pagoError) {
        console.error('Error al crear pago:', pagoError);
        throw pagoError;
      }
      
      console.log(`Pago creado para reservación: ${reservacion.id}`);

      // Redirigir a la página de pago
      toast.success('Reservación creada correctamente');
      navigateTo(`/pago/${reservacion.id}`);
    } catch (error) {
      console.error('Error al crear reservación:', error);
      toast.error('Error al procesar la reservación');
      setProcesandoReserva(false);
    }
  }, [asientosSeleccionados, procesandoReserva, user, horarioData, fecha]);

  // Formatear fecha y hora (memoizado)
  const formatDate = useCallback((dateStr) => {
    return new Date(dateStr).toLocaleDateString('es-EC', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  }, []);

  // Componente para renderizar el mapa de asientos (memoizado)
  const renderAsientos = useMemo(() => {
    if (!busData || asientos.length === 0) return null;

    // Organizar asientos por filas (4 asientos por fila, 2 en cada lado con pasillo)
    const filas = [];
    const asientosPorFila = 4;
    
    for (let i = 0; i < asientos.length; i += asientosPorFila) {
      filas.push(asientos.slice(i, i + asientosPorFila));
    }

    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Selecciona tus asientos</h3>
        
        <div className="mb-4 flex justify-center">
          <div className="flex space-x-4 text-sm">
            <div className="flex items-center">
              <div className="w-6 h-6 bg-gray-200 rounded mr-2"></div>
              <span>Disponible</span>
            </div>
            <div className="flex items-center">
              <div className="w-6 h-6 bg-primary rounded mr-2"></div>
              <span>Seleccionado</span>
            </div>
            <div className="flex items-center">
              <div className="w-6 h-6 bg-gray-400 rounded mr-2"></div>
              <span>Ocupado</span>
            </div>
          </div>
        </div>
        
        <div className="flex justify-center mb-6">
          <div className="w-10 h-20 bg-gray-300 rounded-t-lg flex items-center justify-center text-gray-700 font-medium">
            Frente
          </div>
        </div>
        
        <div className="flex flex-col items-center space-y-3">
          {filas.map((fila, filaIndex) => (
            <div key={filaIndex} className="flex space-x-8">
              <div className="flex space-x-2">
                {fila.slice(0, 2).map((asiento) => {
                  const isReservado = asientosReservados.includes(asiento.id);
                  const isSeleccionado = asientosSeleccionados.includes(asiento.id);
                  
                  return (
                    <button
                      key={asiento.id}
                      onClick={() => toggleAsiento(asiento.id)}
                      disabled={isReservado}
                      className={`w-10 h-10 rounded flex items-center justify-center transition ${
                        isReservado 
                          ? 'bg-gray-400 cursor-not-allowed' 
                          : isSeleccionado 
                            ? 'bg-primary text-white' 
                            : 'bg-gray-200 hover:bg-gray-300'
                      }`}
                    >
                      {asiento.numero}
                    </button>
                  );
                })}
              </div>
              <div className="flex space-x-2">
                {fila.slice(2, 4).map((asiento) => {
                  const isReservado = asientosReservados.includes(asiento.id);
                  const isSeleccionado = asientosSeleccionados.includes(asiento.id);
                  
                  return (
                    <button
                      key={asiento.id}
                      onClick={() => toggleAsiento(asiento.id)}
                      disabled={isReservado}
                      className={`w-10 h-10 rounded flex items-center justify-center transition ${
                        isReservado 
                          ? 'bg-gray-400 cursor-not-allowed' 
                          : isSeleccionado 
                            ? 'bg-primary text-white' 
                            : 'bg-gray-200 hover:bg-gray-300'
                      }`}
                    >
                      {asiento.numero}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }, [busData, asientos, asientosReservados, asientosSeleccionados, toggleAsiento]);

  // Componentes de estado memoizados
  const loadingContent = useMemo(() => (
    <div className="flex justify-center items-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4">Cargando información del viaje...</p>
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

  // Mostrar pantalla de carga mientras se verifica autenticación o se cargan datos
  if (authLoading || loading) {
    return loadingContent;
  }

  // Mostrar error si ocurrió alguno
  if (error) {
    return errorContent;
  }

  // Mostrar mensaje si no se encontraron los datos necesarios
  if (!rutaData || !horarioData || !busData) {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-bold mb-4">Información no disponible</h2>
        <p className="mb-4">No se encontró la información necesaria para completar la reservación.</p>
        <Link href="/" className="text-primary hover:underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link 
          href={`/horarios?ruta=${rutaData?.id}&fecha=${fecha}`} 
          className="text-primary hover:underline flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Volver a horarios
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-2xl font-bold mb-4">Reserva tu viaje</h1>
        
        <div className="space-y-2 mb-4">
          <p className="text-lg font-medium">
            {rutaData?.origen} → {rutaData?.destino}
          </p>
          <p>
            <span className="font-medium">Fecha:</span> {formatDate(fecha)}
          </p>
          <p>
            <span className="font-medium">Hora de salida:</span> {horarioData?.hora_salida.substring(0, 5)}
          </p>
          <p>
            <span className="font-medium">Bus:</span> {busData?.numero} - {busData?.tipo}
          </p>
          <p>
            <span className="font-medium">Precio por asiento:</span> ${horarioData?.precio.toFixed(2)}
          </p>
        </div>
      </div>

      {renderAsientos}

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h3 className="text-lg font-semibold mb-1">Resumen</h3>
            <p className="text-gray-600">
              {asientosSeleccionados.length} {asientosSeleccionados.length === 1 ? 'asiento' : 'asientos'} seleccionados
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <p className="text-sm text-gray-600">Total a pagar</p>
            <p className="text-2xl font-bold text-primary">
              ${(asientosSeleccionados.length * horarioData?.precio).toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse md:flex-row justify-between">
          <Link href={`/horarios?ruta=${rutaData?.id}&fecha=${fecha}`} className="mt-4 md:mt-0 text-primary text-center md:text-left hover:underline">
            Cancelar y volver
          </Link>
          <button
            onClick={crearReservacion}
            disabled={asientosSeleccionados.length === 0 || procesandoReserva}
            className="bg-primary text-white px-6 py-3 rounded hover:bg-opacity-90 disabled:opacity-50 transition flex items-center justify-center"
          >
            {procesandoReserva ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procesando...
              </>
            ) : 'Continuar a pago'}
          </button>
        </div>
      </div>
    </div>
  );
}