import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

export default function Reservar() {
  const router = useRouter();
  const { horario, fecha } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [procesandoReserva, setProcesandoReserva] = useState(false);
  const [user, setUser] = useState(null);
  const [horarioData, setHorarioData] = useState(null);
  const [rutaData, setRutaData] = useState(null);
  const [busData, setBusData] = useState(null);
  const [asientos, setAsientos] = useState([]);
  const [asientosSeleccionados, setAsientosSeleccionados] = useState([]);
  const [asientosReservados, setAsientosReservados] = useState([]);

  // Verificar autenticación
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Debes iniciar sesión para reservar');
        router.push(`/login?redirect=/reservar?horario=${horario}&fecha=${fecha}`);
        return;
      }
      
      setUser(session.user);
    };

    if (horario && fecha) {
      checkAuth();
    }
  }, [horario, fecha, router]);

  // Cargar datos del horario, ruta, bus y asientos
  useEffect(() => {
    const fetchData = async () => {
      if (!horario || !fecha || !user) return;

      setLoading(true);
      
      try {
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

        if (horarioError) throw horarioError;
        setHorarioData(horarioData);

        // Obtener datos de la ruta
        const { data: rutaData, error: rutaError } = await supabase
          .from('rutas')
          .select('*')
          .eq('id', horarioData.ruta_id)
          .single();

        if (rutaError) throw rutaError;
        setRutaData(rutaData);

        // Obtener datos del bus
        const { data: busData, error: busError } = await supabase
          .from('buses')
          .select('*')
          .eq('id', horarioData.bus_id)
          .single();

        if (busError) throw busError;
        setBusData(busData);

        // Obtener todos los asientos del bus
        const { data: asientosData, error: asientosError } = await supabase
          .from('asientos')
          .select('*')
          .eq('bus_id', horarioData.bus_id)
          .order('numero');

        if (asientosError) throw asientosError;

        // Obtener asientos ya reservados para este horario y fecha
        const { data: reservaciones, error: reservacionesError } = await supabase
          .from('reservaciones')
          .select(`
            id,
            detalles_reservacion (
              asiento_id
            )
          `)
          .eq('horario_id', horarioData.id)
          .eq('fecha_viaje', fecha)
          .in('estado', ['Pendiente', 'Confirmada']);

        if (reservacionesError) throw reservacionesError;

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
        setAsientos(asientosData);
      } catch (error) {
        console.error('Error al cargar datos:', error);
        toast.error('Error al cargar información del viaje');
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [horario, fecha, user, router]);

  // Manejar selección de asientos
  const toggleAsiento = (asientoId) => {
    if (asientosReservados.includes(asientoId)) {
      return; // No permitir seleccionar asientos ya reservados
    }

    setAsientosSeleccionados(prev => {
      if (prev.includes(asientoId)) {
        return prev.filter(id => id !== asientoId);
      } else {
        return [...prev, asientoId];
      }
    });
  };

  // Crear la reservación
  const crearReservacion = async () => {
    if (asientosSeleccionados.length === 0) {
      toast.error('Debes seleccionar al menos un asiento');
      return;
    }

    setProcesandoReserva(true);

    try {
      const referenceCode = `RES-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Crear la reservación
      const { data: reservacion, error: reservacionError } = await supabase
        .from('reservaciones')
        .insert([{
          usuario_id: user.id,
          horario_id: horarioData.id,
          fecha_viaje: fecha,
          estado: 'Pendiente',
          reference_code: referenceCode
        }])
        .select()
        .single();

      if (reservacionError) throw reservacionError;

      // Crear detalles de la reservación (asientos)
      const detallesReservacion = asientosSeleccionados.map(asientoId => ({
        reservacion_id: reservacion.id,
        asiento_id: asientoId,
        precio: horarioData.precio
      }));

      const { error: detallesError } = await supabase
        .from('detalles_reservacion')
        .insert(detallesReservacion);

      if (detallesError) throw detallesError;

      // Crear registro de pago
      const montoTotal = horarioData.precio * asientosSeleccionados.length;
      
      const { error: pagoError } = await supabase
        .from('pagos')
        .insert([{
          reservacion_id: reservacion.id,
          monto: montoTotal,
          estado: 'Pendiente'
        }]);

      if (pagoError) throw pagoError;

      // Redirigir a la página de pago
      router.push(`/pago/${reservacion.id}`);
    } catch (error) {
      console.error('Error al crear reservación:', error);
      toast.error('Error al procesar la reservación');
    } finally {
      setProcesandoReserva(false);
    }
  };

  // Renderizar mapa de asientos
  const renderAsientos = () => {
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
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Cargando información del viaje...</p>
        </div>
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
            <span className="font-medium">Fecha:</span> {new Date(fecha).toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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

      {renderAsientos()}

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
            className="bg-primary text-white px-6 py-3 rounded hover:bg-opacity-90 disabled:opacity-50 transition"
          >
            {procesandoReserva ? 'Procesando...' : 'Continuar a pago'}
          </button>
        </div>
      </div>
    </div>
  );
}