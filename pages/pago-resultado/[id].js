// pages/pago-resultado/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import axios from 'axios';

export default function PagoResultado() {
  const router = useRouter();
  const { id } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [verificandoPago, setVerificandoPago] = useState(false);
  const [reservacion, setReservacion] = useState(null);
  const [pago, setPago] = useState(null);
  const [user, setUser] = useState(null);
  const [pagoStatus, setPagoStatus] = useState(null);
  const [error, setError] = useState(null);
  
  // useEffect para verificar autenticación y cargar datos
  useEffect(() => {
    // Función fetchData mejorada para pages/pago-resultado/[id].js
    const fetchData = async () => {
      if (!id) return;

      try {
        console.log(`Iniciando carga de datos para reservación: ${id}`);
        
        // Obtener sesión del usuario
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.log('No hay sesión activa, redirigiendo a login');
          toast.error('Debes iniciar sesión para ver los detalles del pago');
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        console.log(`Usuario autenticado: ${session.user.id}`);

        // Obtener datos de reservación
        const { data: reservacionData, error: reservacionError } = await supabase
          .from('reservaciones')
          .select('*')
          .eq('id', id)
          .single();

        if (reservacionError) {
          console.error('Error obteniendo reservación:', reservacionError);
          throw reservacionError;
        }
        
        console.log(`Reservación encontrada: ${reservacionData.reference_code}, estado: ${reservacionData.estado}`);
        
        // Verificar que la reservación pertenece al usuario
        const reservacionUserId = String(reservacionData.usuario_id);
        const currentUserId = String(session.user.id);
        
        if (reservacionUserId !== currentUserId) {
          console.error(`La reservación pertenece a ${reservacionUserId}, no a ${currentUserId}`);
          toast.error('No tienes permiso para acceder a esta reservación');
          router.push('/reservaciones');
          return;
        }
        
        setReservacion(reservacionData);

        // Obtener datos del pago
        const { data: pagoData, error: pagoError } = await supabase
          .from('pagos')
          .select('*')
          .eq('reservacion_id', id)
          .single();

        if (pagoError) {
          console.error('Error obteniendo pago:', pagoError);
          throw pagoError;
        }
        
        console.log(`Pago encontrado, id: ${pagoData.id}, estado: ${pagoData.estado}`);
        setPago(pagoData);

        // Intentar obtener el requestId de múltiples fuentes
        let requestId = null;
        
        // 1. Desde la URL (parámetro de consulta)
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          requestId = urlParams.get('requestId');
          console.log(`RequestId de URL: ${requestId || 'no encontrado'}`);
        }
        
        // 2. Desde el pago almacenado
        if (!requestId && pagoData.place_to_pay_id) {
          requestId = pagoData.place_to_pay_id;
          console.log(`RequestId de BD: ${requestId}`);
        }
        
        // 3. Desde el objeto de datos del pago
        if (!requestId && pagoData.datos_pago && pagoData.datos_pago.requestId) {
          requestId = pagoData.datos_pago.requestId;
          console.log(`RequestId de datos_pago: ${requestId}`);
        }
        
        // 4. Si todavía no tenemos requestId, verificar si hay transacciones recientes para este comercio
        if (!requestId) {
          // Aquí podríamos hacer una consulta a un endpoint interno para obtener las transacciones recientes
          console.log('No se encontró requestId en ninguna fuente');
        }
        
        // Si encontramos un requestId, actualizar el pago si es necesario y verificar el estado
        if (requestId) {
          console.log(`Verificando estado de pago con requestId: ${requestId}`);
          
          // Si el pago no tiene requestId almacenado pero lo obtuvimos de otra fuente, actualizarlo
          if (!pagoData.place_to_pay_id) {
            console.log(`Actualizando place_to_pay_id a ${requestId} para el pago ${pagoData.id}`);
            const { error: updateIdError } = await supabase
              .from('pagos')
              .update({ place_to_pay_id: requestId })
              .eq('id', pagoData.id);
              
            if (updateIdError) {
              console.error('Error actualizando place_to_pay_id:', updateIdError);
            } else {
              // Actualizar el objeto local
              pagoData.place_to_pay_id = requestId;
              setPago({...pagoData, place_to_pay_id: requestId});
            }
          }
          
          await verificarPago(requestId, true);
        } else {
          console.log('No hay ID de PlaceToPay para verificar');
          setError('No hay información de pago disponible para verificar');
          
          // Incluso sin requestId, intentemos verificar si el pago ya está aprobado
          if (pagoData.estado === 'Aprobado') {
            setReservacion({...reservacionData, estado: 'Confirmada'});
            setPago({...pagoData, estado: 'Aprobado'});
            setPagoStatus({ 
              status: { 
                status: 'APPROVED', 
                message: 'La transacción ha sido aprobada exitosamente' 
              } 
            });
          }
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
        setError(error.message || 'Error al cargar información del pago');
        toast.error('Error al cargar información del pago');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, router]);

  // Función verificarPago mejorada para pages/pago-resultado/[id].js
  const verificarPago = async (requestId, isInitialCheck = false) => {
    if (!requestId) {
      console.error('No hay requestId para verificar');
      setError('No hay información de pago disponible');
      setPagoStatus({ status: { status: 'ERROR', message: 'No hay información de pago disponible' } });
      return;
    }

    setVerificandoPago(true);
    setError(null);
    
    try {
      console.log(`Enviando solicitud para verificar pago, requestId: ${requestId}`);
      
      // Usar el endpoint API para verificar el estado del pago
      const response = await axios.post('/api/payment-status', {
        requestId,
        reservacionId: id
      });
      
      console.log('Respuesta de verificación:', response.data);
      
      if (!response.data || !response.data.success) {
        throw new Error(response.data?.message || 'Error en la verificación');
      }
      
      // Actualizar estados locales con la respuesta
      setPagoStatus(response.data.paymentStatus);
      setPago(response.data.pago);
      setReservacion(response.data.reservacion);
      
      console.log(`Estado actualizado: ${response.data.paymentStatus.status.status}`);
      
      // Si es el primer chequeo y el estado sigue pendiente, intentar de nuevo después de un retraso
      if (isInitialCheck && response.data.pago.estado === 'Pendiente') {
        console.log('Programando verificación adicional en 3 segundos');
        setTimeout(() => verificarPago(requestId), 3000);
      }
      
      // Si el pago está aprobado pero la aplicación muestra pendiente, forzar una actualización
      if ((response.data.paymentStatus.status.status === 'APPROVED' || 
          response.data.paymentStatus.status.status === 'APPROVED_PARTIAL') && 
          response.data.pago.estado !== 'Aprobado') {
        console.log('El pago está aprobado pero el estado no se actualizó correctamente. Forzando actualización...');
        
        // Actualizar manualmente el estado del pago en la base de datos
        const { error: updateError } = await supabase
          .from('pagos')
          .update({
            estado: 'Aprobado',
            updated_at: new Date().toISOString()
          })
          .eq('id', response.data.pago.id);
        
        if (updateError) {
          console.error('Error al actualizar pago manualmente:', updateError);
        } else {
          console.log('Pago actualizado manualmente a Aprobado');
          // Actualizar la reservación también
          const { error: reservaError } = await supabase
            .from('reservaciones')
            .update({
              estado: 'Confirmada',
              updated_at: new Date().toISOString()
            })
            .eq('id', id);
          
          if (reservaError) {
            console.error('Error al actualizar reservación manualmente:', reservaError);
          } else {
            console.log('Reservación actualizada manualmente a Confirmada');
            // Actualizar estados locales
            setPago({...response.data.pago, estado: 'Aprobado'});
            setReservacion({...response.data.reservacion, estado: 'Confirmada'});
          }
        }
      }
      
    } catch (error) {
      console.error('Error al verificar pago:', error);
      setError(error.response?.data?.message || error.message || 'Error al verificar el estado del pago');
      
      // Incluso si hay error, verificamos si podemos usar datos locales
      if (pago && pago.datos_pago && pago.datos_pago.status && pago.datos_pago.status.status === 'APPROVED') {
        console.log('Usando datos de pago almacenados para mostrar estado aprobado');
        setPagoStatus({ status: pago.datos_pago.status });
        setPago({...pago, estado: 'Aprobado'});
        setReservacion({...reservacion, estado: 'Confirmada'});
      } else {
        toast.error('Error al verificar el estado del pago');
      }
    } finally {
      setVerificandoPago(false);
    }
  };

  // useEffect adicional para verificar inconsistencias entre el pago y la reservación
  useEffect(() => {
    // Si estamos en la página de resultado y hay un pago con estado "Aprobado", pero la reservación
    // sigue en "Pendiente", intentamos forzar una actualización
    const actualizarEstadoReservacion = async () => {
      if (pago && reservacion && pago.estado === 'Aprobado' && reservacion.estado === 'Pendiente') {
        console.log('Detectada inconsistencia: Pago aprobado pero reservación pendiente. Forzando actualización...');
        
        try {
          const { data, error } = await supabase
            .from('reservaciones')
            .update({ 
              estado: 'Confirmada',
              updated_at: new Date().toISOString()
            })
            .eq('id', reservacion.id)
            .select()
            .single();
              
          if (error) {
            console.error('Error al actualizar reservación:', error);
          } else {
            console.log('Reservación actualizada correctamente');
            setReservacion(data);
          }
        } catch (e) {
          console.error('Error al forzar actualización de reservación:', e);
        }
      }
    };
    
    if (!loading && pago && reservacion) {
      actualizarEstadoReservacion();
    }
  }, [pago, reservacion, loading]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Verificando el estado de tu pago...</p>
        </div>
      </div>
    );
  }

  const renderEstadoPago = () => {
    const estado = pago?.estado || 'Desconocido';
    const statusMessage = pagoStatus?.status?.message || error || '';
    
    let statusColor, statusIcon, statusTitle;
    
    switch (estado) {
      case 'Aprobado':
        statusColor = 'bg-green-100 text-green-800';
        statusIcon = (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
        statusTitle = 'Pago Aprobado';
        break;
      case 'Rechazado':
        statusColor = 'bg-red-100 text-red-800';
        statusIcon = (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
        statusTitle = 'Pago Rechazado';
        break;
      case 'Pendiente':
        statusColor = 'bg-yellow-100 text-yellow-800';
        statusIcon = (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-yellow-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
        statusTitle = 'Pago Pendiente';
        break;
      default:
        statusColor = 'bg-gray-100 text-gray-800';
        statusIcon = (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
        statusTitle = 'Estado Desconocido';
    }

    return (
      <div className="text-center p-6">
        {statusIcon}
        <h2 className="text-2xl font-bold mb-2">{statusTitle}</h2>
        <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
          {estado}
        </div>
        {statusMessage && (
          <p className="mt-4 text-gray-600">{statusMessage}</p>
        )}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
          <p>Código de referencia: {reservacion?.reference_code || 'N/A'}</p>
          {pago?.place_to_pay_id && (
            <p>ID de transacción: {pago.place_to_pay_id}</p>
          )}
          <p>Fecha: {new Date().toLocaleDateString('es-EC')}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="p-4 bg-primary text-white">
          <h1 className="text-xl font-bold">Resultado del Pago</h1>
        </div>
        
        {renderEstadoPago()}
        
        <div className="p-6 border-t">
          <div className="flex flex-col space-y-4">
            <Link
              href="/reservaciones"
              className="bg-primary text-white py-3 px-6 rounded text-center hover:bg-opacity-90"
            >
              Ver mis reservaciones
            </Link>
            
            {pago?.estado === 'Pendiente' && (
              <button
                onClick={() => verificarPago(pago.place_to_pay_id || router.query.requestId)}
                disabled={verificandoPago}
                className="border border-primary text-primary py-3 px-6 rounded text-center hover:bg-primary hover:bg-opacity-10 disabled:opacity-50"
              >
                {verificandoPago ? 'Verificando...' : 'Verificar estado de pago'}
              </button>
            )}
            
            {pago?.estado === 'Pendiente' && pago?.url_redireccion && (
              <a
                href={pago.url_redireccion}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-primary hover:underline"
              >
                Volver a la página de pago
              </a>
            )}
            
            {pago?.estado === 'Rechazado' && (
              <Link
                href={`/pago/${id}?retry=true`}
                className="text-center text-primary hover:underline"
              >
                Intentar pagar de nuevo
              </Link>
            )}
            
            {pago?.estado === 'Aprobado' && (
              <Link 
                href={`/boleto/${id}`}
                className="border border-primary text-primary py-3 px-6 rounded text-center hover:bg-primary hover:bg-opacity-10"
              >
                Ver mi boleto
              </Link>
            )}
            
            <Link
              href="/"
              className="text-center text-gray-500 hover:underline"
            >
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}