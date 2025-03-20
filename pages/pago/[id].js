// pages/pago/[id].js
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { navigateToPaymentGateway, navigateTo } from '../../lib/navigationService';
import { useAuth } from '../../lib/AuthContext'; // Contexto centralizado de auth

// Hook personalizado para obtener parámetros de ruta
function useParams() {
  const router = typeof window !== 'undefined' ? 
    require('next/router').useRouter() : { query: {} };
  return router.query || {};
}

export default function Pago() {
  // Obtener el ID de la reservación de la URL
  const { id, retry } = useParams();
  
  // Estados locales
  const [loading, setLoading] = useState(true);
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [reservacion, setReservacion] = useState(null);
  const [horario, setHorario] = useState(null);
  const [ruta, setRuta] = useState(null);
  const [pago, setPago] = useState(null);
  const [asientos, setAsientos] = useState([]);
  const [error, setError] = useState(null);

  // Usar contexto de autenticación centralizado
  const { user, profile, loading: authLoading } = useAuth();

  // Cache de solicitudes de pago para prevenir duplicados
  const paymentRequestCache = useMemo(() => new Map(), []);

  // Efecto para cargar datos de la reservación
  useEffect(() => {
    // Solo ejecutar si id está disponible y tenemos usuario autenticado
    if (!id || authLoading) return;

    // Si no hay usuario después de verificar autenticación, redirigir a login
    if (!user && !authLoading) {
      toast.error('Debes iniciar sesión para completar el pago');
      navigateTo(`/login?redirect=${encodeURIComponent(`/pago/${id}`)}`);
      return;
    }

    const fetchData = async () => {
      try {
        console.log(`Iniciando carga de datos para reservación: ${id}`);
        
        // Cargar datos de reservación
        const { data: reservacionData, error: reservacionError } = await supabase
          .from('reservaciones')
          .select(`
            id,
            horario_id,
            fecha_viaje,
            estado,
            reference_code,
            usuario_id,
            detalles_reservacion (
              id,
              asiento_id,
              precio,
              asientos:asiento_id (
                id,
                numero,
                tipo
              )
            )
          `)
          .eq('id', id)
          .single();

        if (reservacionError) {
          console.error('Error al cargar reservación:', reservacionError);
          throw reservacionError;
        }
        
        // Verificar que la reservación pertenece al usuario
        if (reservacionData.usuario_id !== user.id) {
          console.error(`Intento de acceso no autorizado. Reserva: ${reservacionData.id}, Usuario: ${user.id}`);
          toast.error('No tienes permiso para acceder a esta reservación');
          navigateTo('/reservaciones');
          return;
        }
        
        console.log(`Reservación cargada: ${reservacionData.reference_code}`);
        setReservacion(reservacionData);
        
        // Ordenar asientos por número
        const asientosOrdenados = reservacionData.detalles_reservacion
          .map(detalle => detalle.asientos)
          .filter(Boolean) // Filtrar posibles nulos
          .sort((a, b) => a.numero - b.numero);
        
        setAsientos(asientosOrdenados);
        console.log(`${asientosOrdenados.length} asientos reservados`);

        // Cargar datos del horario
        const { data: horarioData, error: horarioError } = await supabase
          .from('horarios')
          .select(`
            id,
            hora_salida,
            precio,
            ruta_id,
            buses:bus_id (
              id,
              numero,
              tipo
            )
          `)
          .eq('id', reservacionData.horario_id)
          .single();

        if (horarioError) {
          console.error('Error al cargar horario:', horarioError);
          throw horarioError;
        }
        
        setHorario(horarioData);
        console.log(`Horario cargado, ruta: ${horarioData.ruta_id}`);

        // Cargar datos de la ruta
        const { data: rutaData, error: rutaError } = await supabase
          .from('rutas')
          .select('*')
          .eq('id', horarioData.ruta_id)
          .single();

        if (rutaError) {
          console.error('Error al cargar ruta:', rutaError);
          throw rutaError;
        }
        
        setRuta(rutaData);
        console.log(`Ruta cargada: ${rutaData.origen} → ${rutaData.destino}`);

        // Cargar datos del pago
        const { data: pagoData, error: pagoError } = await supabase
          .from('pagos')
          .select('*')
          .eq('reservacion_id', id)
          .single();

        // Si no existe un pago o hubo error, crearlo
        if (pagoError || !pagoData) {
          if (pagoError && pagoError.code !== 'PGRST116') {
            console.error('Error al cargar pago:', pagoError);
            throw pagoError;
          }
          
          console.log('No existe un pago para esta reservación, creando uno nuevo...');
          
          // Calcular monto total sumando el precio de todos los asientos
          const montoTotal = reservacionData.detalles_reservacion.reduce(
            (total, detalle) => total + (detalle.precio || 0), 
            0
          );
          
          const { data: nuevoPago, error: nuevoPagoError } = await supabase
            .from('pagos')
            .insert([{
              reservacion_id: id,
              monto: montoTotal,
              estado: 'Pendiente',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select()
            .single();
            
          if (nuevoPagoError) {
            console.error('Error al crear nuevo pago:', nuevoPagoError);
            throw nuevoPagoError;
          }
          
          console.log(`Nuevo pago creado con id: ${nuevoPago.id}`);
          setPago(nuevoPago);
        } else {
          console.log(`Pago existente cargado, id: ${pagoData.id}, estado: ${pagoData.estado}`);
          setPago(pagoData);
          
          // Si ya hay una URL de pago válida y el pago está pendiente, redirigir automáticamente
          // a menos que sea un reintento explícito
          if (pagoData.url_redireccion && pagoData.estado === 'Pendiente' && !retry) {
            console.log('Redirigiendo a la URL de pago existente:', pagoData.url_redireccion);
            navigateToPaymentGateway(pagoData.url_redireccion);
            return;
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error al cargar datos:', error);
        setError('Error al cargar información de la reservación');
        toast.error('Error al cargar información de la reservación');
        setLoading(false);
      }
    };

    fetchData();
  }, [id, user, authLoading, retry]);

  // Función para iniciar un pago - Optimizada y memoizada
  const iniciarPago = useCallback(async () => {
    if (!reservacion || !pago || !user) {
      toast.error('Información de reserva incompleta');
      return;
    }

    if (procesandoPago) {
      return; // Prevenir envíos múltiples
    }

    // Verificar cache para evitar solicitudes duplicadas
    const requestCacheKey = `${reservacion.id}-${Date.now().toString().slice(0, -3)}`;
    if (paymentRequestCache.has(requestCacheKey)) {
      console.log('Solicitud de pago duplicada detectada. Ignorando.');
      return;
    }
    
    // Marcar como en proceso y registrar en caché
    setProcesandoPago(true);
    paymentRequestCache.set(requestCacheKey, Date.now());
    
    // Limpiar entradas antiguas del caché
    const now = Date.now();
    paymentRequestCache.forEach((timestamp, key) => {
      if (now - timestamp > 300000) { // 5 minutos
        paymentRequestCache.delete(key);
      }
    });

    try {
      // Si ya tenemos una URL de redirección y es un reintento, limpiarla
      if (pago.url_redireccion && retry) {
        console.log('Reintentar pago: limpiando URL anterior');
        
        const { error: updateUrlError } = await supabase
          .from('pagos')
          .update({ 
            url_redireccion: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', pago.id);
          
        if (updateUrlError) {
          console.warn('Error al limpiar URL antigua:', updateUrlError);
        }
      } 
      // Si ya tenemos una URL de redirección válida y no es un reintento, usarla
      else if (pago.url_redireccion && !retry) {
        console.log(`Redirigiendo a URL de pago existente: ${pago.url_redireccion}`);
        navigateToPaymentGateway(pago.url_redireccion);
        return;
      }

      // Crear sesión de pago
      const returnUrl = `${window.location.origin}/pago-resultado/${reservacion.id}`;
      const notificationUrl = `${window.location.origin}/api/notificacionPTP`;
      
      const paymentData = {
        reference: reservacion.reference_code,
        description: `Reserva de pasajes: ${ruta.origen} a ${ruta.destino}`,
        amount: pago.monto,
        currency: 'USD',
        buyerEmail: user.email,
        buyerName: profile?.nombre || 'Cliente',
        buyerSurname: profile?.apellido || 'Web',
        buyerDocument: profile?.cedula || '0000000000',
        buyerDocumentType: 'CC',
        returnUrl,
        notificationUrl,
        expirationMinutes: 60
      };

      console.log('Enviando solicitud de pago con referencia:', reservacion.reference_code);
      
      const response = await fetch(`${window.location.origin}/api/place-to-pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error al crear sesión de pago: ${errorText}`);
      }

      const data = await response.json();
      
      if (!data || data.status?.status !== 'OK') {
        throw new Error('Error en respuesta de PlaceToPay: ' + JSON.stringify(data));
      }

      console.log('PlaceToPay respuesta:', {
        requestId: data.requestId,
        processUrl: data.processUrl ? 'URL disponible' : 'No URL'
      });

      // Verificar que tenemos requestId
      if (!data.requestId) {
        throw new Error('No se recibió requestId de PlaceToPay');
      }

      const requestId = data.requestId.toString();
      console.log(`Actualizando pago ${pago.id} con requestId: ${requestId}`);
      
      // Actualizar pago en Supabase
      const { error: updateError } = await supabase
        .from('pagos')
        .update({
          place_to_pay_id: requestId,
          url_redireccion: data.processUrl,
          datos_pago: data,
          updated_at: new Date().toISOString()
        })
        .eq('id', pago.id);

      if (updateError) {
        console.error('Error al actualizar pago en base de datos:', updateError);
        throw updateError;
      }

      // Verificar que el requestId se guardó correctamente
      const { data: updatedPago, error: verifyError } = await supabase
        .from('pagos')
        .select('place_to_pay_id, url_redireccion')
        .eq('id', pago.id)
        .single();
        
      if (verifyError) {
        console.error('Error al verificar actualización:', verifyError);
      } else if (updatedPago.place_to_pay_id !== requestId) {
        console.error('¡ALERTA! El requestId no se guardó correctamente');
        console.error('- Esperado:', requestId);
        console.error('- Guardado:', updatedPago.place_to_pay_id);
        
        // Intento adicional de actualización
        const { error: retryError } = await supabase
          .from('pagos')
          .update({ place_to_pay_id: requestId })
          .eq('id', pago.id);
          
        if (retryError) {
          console.error('Error en segundo intento de actualización:', retryError);
        } else {
          console.log('Segundo intento de actualización exitoso');
        }
      }

      // Redirigir a PlaceToPay
      navigateToPaymentGateway(data.processUrl);
    } catch (error) {
      console.error('Error al procesar pago:', error);
      toast.error('Error al procesar el pago: ' + error.message);
      setProcesandoPago(false);
    }
  }, [reservacion, pago, user, profile, ruta, procesandoPago, retry, paymentRequestCache]);

  // Contenido de carga (memoizado para evitar recreaciones)
  const loadingContent = useMemo(() => (
    <div className="flex justify-center items-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4">Cargando información de pago...</p>
      </div>
    </div>
  ), []);

  // Contenido de error (memoizado)
  const errorContent = useMemo(() => (
    <div className="max-w-4xl mx-auto text-center py-10">
      <h2 className="text-2xl font-bold mb-4">Error</h2>
      <p className="mb-4 text-red-500">{error}</p>
      <Link href="/reservaciones" className="text-primary hover:underline">
        Ver mis reservaciones
      </Link>
    </div>
  ), [error]);

  // Formato de fecha
  const formatFecha = useCallback((dateStr) => {
    return new Date(dateStr).toLocaleDateString('es-EC');
  }, []);

  // Formato de hora
  const formatHora = useCallback((timeStr) => {
    if (!timeStr) return '';
    return timeStr.substring(0, 5);
  }, []);

  // Mostrar pantalla de carga mientras se verifica autenticación o se cargan datos
  if (authLoading || loading) {
    return loadingContent;
  }

  // Mostrar error si ocurrió alguno
  if (error) {
    return errorContent;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="p-4 bg-primary text-white">
          <h1 className="text-xl font-bold">Completar Pago</h1>
        </div>
        
        <div className="p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Detalles del Viaje</h2>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600">Ruta:</p>
                  <p className="font-medium">{ruta?.origen} → {ruta?.destino}</p>
                </div>
                <div>
                  <p className="text-gray-600">Fecha:</p>
                  <p className="font-medium">{formatFecha(reservacion?.fecha_viaje)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Hora de Salida:</p>
                  <p className="font-medium">{formatHora(horario?.hora_salida)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Bus:</p>
                  <p className="font-medium">{horario?.buses?.numero} - {horario?.buses?.tipo}</p>
                </div>
                <div>
                  <p className="text-gray-600">Asientos:</p>
                  <p className="font-medium">
                    {asientos.map(asiento => asiento.numero).join(', ')}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Código de Referencia:</p>
                  <p className="font-medium">{reservacion?.reference_code}</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Datos de Pago</h2>
            
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600">Nombre:</p>
                  <p className="font-medium">{profile?.nombre} {profile?.apellido}</p>
                </div>
                <div>
                  <p className="text-gray-600">Cédula:</p>
                  <p className="font-medium">{profile?.cedula || 'No disponible'}</p>
                </div>
                <div>
                  <p className="text-gray-600">Email:</p>
                  <p className="font-medium">{user?.email}</p>
                </div>
                <div>
                  <p className="text-gray-600">Teléfono:</p>
                  <p className="font-medium">{profile?.telefono || 'No disponible'}</p>
                </div>
              </div>
              
              {(!profile?.nombre || !profile?.apellido || !profile?.cedula) && (
                <div className="mt-3 p-3 bg-yellow-100 text-yellow-800 rounded-lg">
                  <p className="text-sm">
                    Tu perfil está incompleto. 
                    <Link href="/perfil" className="ml-1 font-medium underline">
                      Actualiza tus datos
                    </Link> 
                    para una mejor experiencia.
                  </p>
                </div>
              )}
            </div>
            
            <div className="border-t border-b py-4">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Pasajes ({asientos.length}):</span>
                <span>${pago?.monto?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>Total:</span>
                <span className="text-primary">${pago?.monto?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col space-y-4">
            <button
              onClick={iniciarPago}
              disabled={procesandoPago}
              className="bg-primary text-white py-3 px-6 rounded hover:bg-opacity-90 disabled:opacity-50 transition"
            >
              {procesandoPago ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Procesando...
                </span>
              ) : 'Pagar con Place to Pay'}
            </button>
            
            <Link 
              href="/reservaciones" 
              className="text-center text-primary hover:underline"
            >
              Cancelar y volver a mis reservaciones
            </Link>
            
            <div className="text-center text-sm text-gray-500 mt-4">
              <p>Tu pago será procesado de forma segura por Place to Pay.</p>
              <p>No compartimos tus datos de pago con terceros.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}