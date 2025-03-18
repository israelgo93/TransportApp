// pages/pago-resultado/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

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

        // Obtener datos de reservación con maybeSingle para evitar errores
        const { data: reservacionData, error: reservacionError } = await supabase
          .from('reservaciones')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (reservacionError && reservacionError.code !== 'PGRST116') {
          console.error('Error obteniendo reservación:', reservacionError);
          throw reservacionError;
        }
        
        if (!reservacionData) {
          console.error(`Reservación no encontrada: ${id}`);
          setError('Reservación no encontrada');
          setLoading(false);
          return;
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

        // Obtener datos del pago con maybeSingle
        const { data: pagoData, error: pagoError } = await supabase
          .from('pagos')
          .select('*')
          .eq('reservacion_id', id)
          .maybeSingle();

        if (pagoError && pagoError.code !== 'PGRST116') {
          console.error('Error obteniendo pago:', pagoError);
          throw pagoError;
        }
        
        if (pagoData) {
          console.log(`Pago encontrado, id: ${pagoData.id}, estado: ${pagoData.estado}`);
          setPago(pagoData);
          
          // Si el pago ya está en un estado final, no es necesario verificarlo
          if (pagoData.estado === 'Aprobado') {
            setPagoStatus({ 
              status: { 
                status: 'APPROVED', 
                message: 'La transacción ha sido aprobada exitosamente' 
              } 
            });
            setLoading(false);
            return;
          } else if (pagoData.estado === 'Rechazado') {
            setPagoStatus({ 
              status: { 
                status: 'REJECTED', 
                message: 'La transacción ha sido rechazada' 
              } 
            });
            setLoading(false);
            return;
          }
        } else {
          console.log('No se encontró información de pago');
          // En lugar de mostrar error, continuamos para crear un nuevo pago si es necesario
        }

        // Intentar obtener el requestId de múltiples fuentes
        let requestId = null;
        
        // 1. Desde la URL (parámetro de consulta)
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          requestId = urlParams.get('requestId');
          console.log(`RequestId de URL: ${requestId || 'no encontrado'}`);
        }
        
        // 2. Desde el pago almacenado
        if (!requestId && pagoData && pagoData.place_to_pay_id) {
          requestId = pagoData.place_to_pay_id;
          console.log(`RequestId de BD: ${requestId}`);
        }
        
        // 3. Desde el objeto de datos del pago
        if (!requestId && pagoData && pagoData.datos_pago && pagoData.datos_pago.requestId) {
          requestId = pagoData.datos_pago.requestId;
          console.log(`RequestId de datos_pago: ${requestId}`);
        }
        
        // Verificar el estado del pago
        await verificarPago(requestId);
      } catch (error) {
        console.error('Error al cargar datos:', error);
        setError(error.message || 'Error al cargar información del pago');
        toast.error('Error al cargar información del pago');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id, router]);

  // Verificar pago con el API interno
  const verificarPago = async (requestId) => {
    setVerificandoPago(true);
    setError(null);
    
    try {
      console.log(`Enviando solicitud para verificar pago, requestId: ${requestId || 'no proporcionado'}`);
      
      // Crear los datos para la solicitud
      const requestData = {
        reservacionId: id  // Usamos el ID de la reservación, no una referencia
      };
      
      // Añadir requestId si existe
      if (requestId) {
        requestData.requestId = requestId;
      }
      
      // Verificar si estamos en desarrollo local
      const isLocalDev = 
        typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        
      // En desarrollo local, usamos supabase directamente para actualizar el estado
      if (isLocalDev) {
        console.log('Detectado entorno de desarrollo local, verificando estado directamente en la BD');
        await verificarPagoDirectamente(requestId);
        setVerificandoPago(false);
        return;
      }
      
      // En producción, llamamos al endpoint
      try {
        const response = await fetch('/api/payment-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
          // Si la API no existe o hay otro error, intentar actualizar directamente
          console.error(`Error en la respuesta (${response.status}): ${await response.text()}`);
          
          if (response.status === 404) {
            console.log('API payment-status no encontrada, actualizando directamente');
            await verificarPagoDirectamente(requestId);
            setVerificandoPago(false);
            return;
          }
          
          throw new Error(`Error verificando pago: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Respuesta de verificación:', data);
        
        if (!data.success) {
          throw new Error(data.message || 'Error desconocido en verificación');
        }
        
        // Actualizar estados locales
        setPagoStatus(data.paymentStatus);
        setPago(data.pago);
        setReservacion(data.reservacion);
        
        // Si el estado cambió, recargar la página para reflejar el cambio
        if (pago && data.pago && data.pago.estado !== pago.estado) {
          console.log(`Estado de pago actualizado: ${pago.estado} -> ${data.pago.estado}`);
          
          // Solo recargar si el pago está aprobado o rechazado
          if (data.pago.estado === 'Aprobado' || data.pago.estado === 'Rechazado') {
            console.log('Recargando página para mostrar estado actualizado');
            toast.success(`Pago ${data.pago.estado.toLowerCase()}`);
            setTimeout(() => {
              window.location.reload();
            }, 2000);
          }
        }
      } catch (apiError) {
        console.error('Error al llamar API payment-status:', apiError);
        // Si falla la llamada a la API, intentamos actualizar directamente
        await verificarPagoDirectamente(requestId);
      }
    } catch (error) {
      console.error('Error al verificar pago:', error);
      setError(error.message || 'Error desconocido al verificar pago');
      toast.error('Error al verificar el estado del pago');
    } finally {
      setVerificandoPago(false);
    }
  };
  
  // Verificación directa sin API (para desarrollo o como fallback)
  const verificarPagoDirectamente = async (requestId) => {
    try {
      console.log('Verificando pago directamente en la base de datos');
      
      // Primero, asegurarnos de que tenemos el pago con el id correcto
      if (!pago) {
        console.log(`Buscando pago para reservación ${id}`);
        const { data: pagoData, error: pagoError } = await supabase
          .from('pagos')
          .select('*')
          .eq('reservacion_id', id)  // Usamos reservacion_id, no reference
          .maybeSingle();
          
        if (!pagoError && pagoData) {
          console.log(`Pago encontrado: ${pagoData.id}`);
          setPago(pagoData);
          // Continuamos con este pago
          if (requestId && !pagoData.place_to_pay_id) {
            console.log(`Actualizando place_to_pay_id a ${requestId}`);
            const { error: updateIdError } = await supabase
              .from('pagos')
              .update({ place_to_pay_id: String(requestId) })
              .eq('id', pagoData.id);
              
            if (updateIdError) {
              console.error('Error actualizando place_to_pay_id:', updateIdError);
            }
          }
          return;
        }
      }
      
      // Si ya tenemos el pago y hay requestId, actualizar place_to_pay_id si es necesario
      if (pago && requestId && !pago.place_to_pay_id) {
        console.log(`Actualizando place_to_pay_id a ${requestId}`);
        const { error: updateIdError } = await supabase
          .from('pagos')
          .update({ place_to_pay_id: String(requestId) })
          .eq('id', pago.id);
          
        if (updateIdError) {
          console.error('Error actualizando place_to_pay_id:', updateIdError);
        }
      }
      
      // Verificar la transacción
      if (requestId) {
        // Aquí deberíamos consultar la API de PlaceToPay directamente,
        // pero esto requeriría exponer credenciales de API al cliente, lo cual no es seguro.
        // En su lugar, simplemente verificamos si hay datos en el pago
        
        if (pago && pago.datos_pago) {
          console.log('Utilizando datos_pago existentes para determinar estado');
          
          // Determinar estado basado en datos_pago
          if (pago.datos_pago.status && pago.datos_pago.status.status === 'APPROVED') {
            // Si el pago está aprobado en PlaceToPay pero no en nuestra BD, actualizarlo
            if (pago.estado !== 'Aprobado') {
              console.log('Actualizando estado a Aprobado');
              const { error: updateError } = await supabase
                .from('pagos')
                .update({ 
                  estado: 'Aprobado',
                  updated_at: new Date().toISOString()
                })
                .eq('id', pago.id);
                
              if (updateError) {
                console.error('Error actualizando pago:', updateError);
              } else {
                // Actualizar también la reservación
                const { error: reservaError } = await supabase
                  .from('reservaciones')
                  .update({ 
                    estado: 'Confirmada',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', id);
                  
                if (reservaError) {
                  console.error('Error actualizando reservación:', reservaError);
                }
                
                // Actualizar el estado local
                setPago({...pago, estado: 'Aprobado'});
                setReservacion({...reservacion, estado: 'Confirmada'});
                setPagoStatus({
                  status: {
                    status: 'APPROVED',
                    message: 'La transacción ha sido aprobada exitosamente'
                  }
                });
                
                toast.success('Pago aprobado');
                setTimeout(() => {
                  window.location.reload();
                }, 2000);
              }
            }
          }
        }
      }
      
      // Refrescar el pago desde la BD
      const { data: updatedPago, error: refreshError } = await supabase
        .from('pagos')
        .select('*')
        .eq('id', pago.id)
        .single();
        
      if (!refreshError && updatedPago) {
        setPago(updatedPago);
        
        // Determinar estado para la UI
        if (updatedPago.estado === 'Aprobado') {
          setPagoStatus({
            status: {
              status: 'APPROVED',
              message: 'La transacción ha sido aprobada exitosamente'
            }
          });
          
          // Verificar y actualizar reservación si es necesario
          if (reservacion.estado !== 'Confirmada') {
            const { data: updatedReservacion } = await supabase
              .from('reservaciones')
              .update({ estado: 'Confirmada' })
              .eq('id', id)
              .select()
              .single();
              
            if (updatedReservacion) {
              setReservacion(updatedReservacion);
            }
          }
        } else if (updatedPago.estado === 'Rechazado') {
          setPagoStatus({
            status: {
              status: 'REJECTED',
              message: 'La transacción ha sido rechazada'
            }
          });
        } else {
          setPagoStatus({
            status: {
              status: 'PENDING',
              message: 'La transacción está pendiente'
            }
          });
        }
      }
    } catch (error) {
      console.error('Error en verificación directa:', error);
      throw error;
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
            .maybeSingle();
              
          if (error) {
            console.error('Error al actualizar reservación:', error);
          } else if (data) {
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