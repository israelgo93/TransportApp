// pages/reserva/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export default function DetalleReservacion() {
  const router = useRouter();
  const { id } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [reservacion, setReservacion] = useState(null);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  // Verificar autenticación y cargar datos
  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        console.log(`Cargando detalles para reservación: ${id}`);
        
        // Verificar sesión del usuario
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          console.log('No hay sesión activa, redirigiendo a login');
          toast.error('Debes iniciar sesión para ver los detalles de la reservación');
          router.push('/login');
          return;
        }
        
        console.log(`Usuario autenticado: ${session.user.id}`);
        setUser(session.user);

        // Solución: Cargar directamente todos los datos de la reservación
        const { data, error } = await supabase
          .from('reservaciones')
          .select(`
            id,
            fecha_viaje,
            estado,
            reference_code,
            created_at,
            usuario_id,
            horarios:horario_id (
              id,
              hora_salida,
              precio,
              dias_operacion,
              rutas:ruta_id (
                id,
                origen,
                destino,
                distancia,
                duracion_estimada
              ),
              buses:bus_id (
                id,
                numero,
                tipo,
                capacidad,
                caracteristicas
              )
            ),
            detalles_reservacion (
              id,
              precio,
              asientos:asiento_id (
                id,
                numero,
                tipo
              )
            ),
            pagos (
              id,
              monto,
              estado,
              place_to_pay_id,
              url_redireccion,
              created_at,
              updated_at
            )
          `)
          .eq('id', id)
          .single();

        if (error) {
          console.error('Error al cargar datos de reservación:', error);
          setError('Reservación no encontrada');
          throw new Error('Reservación no encontrada');
        }
        
        // Verificar que la reservación pertenece al usuario actual
        // SOLUCIÓN: Convertir a string ambos IDs para una comparación consistente
        const reservacionUserId = String(data.usuario_id);
        const currentUserId = String(session.user.id);
        
        console.log(`Comparando IDs - Reservación: ${reservacionUserId}, Usuario actual: ${currentUserId}`);
        
        if (reservacionUserId !== currentUserId) {
          console.error(`La reservación pertenece a ${reservacionUserId}, no a ${currentUserId}`);
          setError('No tienes permiso para ver esta reservación');
          throw new Error('No tienes permiso para ver esta reservación');
        }
        
        console.log(`Datos completos cargados para reservación: ${data.reference_code}`);
        setReservacion(data);
      } catch (error) {
        console.error('Error al cargar datos:', error);
        setError(error.message || 'Error al cargar información de la reservación');
        toast.error(error.message || 'Error al cargar información de la reservación');
        // No redirigimos inmediatamente para mostrar el mensaje de error
        setTimeout(() => {
          router.push('/reservaciones');
        }, 3000);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, router]);

  const formatFecha = (fechaStr) => {
    return new Date(fechaStr).toLocaleDateString('es-EC', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatHora = (horaStr) => {
    if (!horaStr) return '';
    return horaStr.substring(0, 5);
  };

  // Función para cancelar reservación
  const cancelarReservacion = async () => {
    if (!reservacion || !confirm('¿Estás seguro de cancelar esta reservación?')) return;

    try {
      const { error } = await supabase
        .from('reservaciones')
        .update({ 
          estado: 'Cancelada',
          updated_at: new Date().toISOString() // Actualizar timestamp
        })
        .eq('id', reservacion.id);

      if (error) throw error;

      // Actualizar la reservación en el estado
      setReservacion(prev => ({ ...prev, estado: 'Cancelada' }));
      
      toast.success('Reservación cancelada correctamente');
    } catch (error) {
      console.error('Error al cancelar reservación:', error);
      toast.error('Error al cancelar la reservación');
    }
  };

  // Renderizar estado de la reservación con el color adecuado
  const renderEstadoReservacion = (estado) => {
    let statusColor, statusText;
    
    switch (estado) {
      case 'Confirmada':
        statusColor = 'bg-green-100 text-green-800';
        statusText = 'Confirmada';
        break;
      case 'Pendiente':
        statusColor = 'bg-yellow-100 text-yellow-800';
        statusText = 'Pendiente de pago';
        break;
      case 'Cancelada':
        statusColor = 'bg-red-100 text-red-800';
        statusText = 'Cancelada';
        break;
      default:
        statusColor = 'bg-gray-100 text-gray-800';
        statusText = estado;
    }

    return (
      <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
        {statusText}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Cargando información de la reservación...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto text-center py-10">
        <h2 className="text-2xl font-bold mb-4">Error</h2>
        <p className="mb-4 text-red-500">{error}</p>
        <Link href="/reservaciones" className="text-primary hover:underline">
          Ver mis reservaciones
        </Link>
      </div>
    );
  }

  if (!reservacion) {
    return (
      <div className="max-w-4xl mx-auto text-center py-10">
        <h2 className="text-2xl font-bold mb-4">Reservación no encontrada</h2>
        <p className="mb-4">La reservación solicitada no existe o no tienes permiso para verla.</p>
        <Link href="/reservaciones" className="text-primary hover:underline">
          Ver mis reservaciones
        </Link>
      </div>
    );
  }

  // Manejo seguro de datos
  const pago = reservacion.pagos && reservacion.pagos.length > 0 ? reservacion.pagos[0] : {};
  const fechaCreacion = formatFecha(reservacion.created_at);
  const horarioRuta = reservacion.horarios?.rutas || {};
  const horarioBus = reservacion.horarios?.buses || {};
  const asientos = reservacion.detalles_reservacion || [];
  
  const duracionHoras = Math.floor((horarioRuta.duracion_estimada || 0) / 60);
  const duracionMinutos = (horarioRuta.duracion_estimada || 0) % 60;
  
  // Calcular precio total con manejo seguro
  const precioTotal = asientos.reduce((total, asiento) => {
    return total + (asiento.precio || 0);
  }, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/reservaciones" className="text-primary hover:underline flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Volver a mis reservaciones
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="p-4 bg-primary text-white flex justify-between items-center">
          <h1 className="text-xl font-bold">Detalles de Reservación</h1>
          {renderEstadoReservacion(reservacion.estado)}
        </div>
        
        <div className="p-6">
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Información del Viaje</h2>
              <p className="text-sm text-gray-600">Código: {reservacion.reference_code}</p>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600 text-sm">Ruta:</p>
                  <p className="font-medium">{horarioRuta.origen} → {horarioRuta.destino}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Fecha:</p>
                  <p className="font-medium">{formatFecha(reservacion.fecha_viaje)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Hora de Salida:</p>
                  <p className="font-medium">{formatHora(reservacion.horarios?.hora_salida)}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Duración estimada:</p>
                  <p className="font-medium">{duracionHoras}h {duracionMinutos}min ({horarioRuta.distancia} km)</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2">Información del Bus</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p><span className="text-gray-600">Número:</span> {horarioBus.numero}</p>
                  <p><span className="text-gray-600">Tipo:</span> {horarioBus.tipo}</p>
                  <p><span className="text-gray-600">Comodidades:</span></p>
                  <ul className="list-disc list-inside text-sm pl-2">
                    {Object.entries(horarioBus.caracteristicas || {})
                      .filter(([_, valor]) => valor === true)
                      .map(([clave]) => (
                        <li key={clave}>{clave}</li>
                      ))}
                  </ul>
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-2">Asientos Reservados</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {asientos.map(asiento => (
                      <span key={asiento.id} className="px-2 py-1 bg-primary text-white text-sm rounded">
                        Asiento {asiento.asientos?.numero}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    Precio por asiento: ${reservacion.horarios?.precio?.toFixed(2) || '0.00'}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Información de Pago</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600 text-sm">Estado del pago:</p>
                  <p className="font-medium">{pago.estado || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Monto total:</p>
                  <p className="font-medium text-lg text-primary">${pago.monto?.toFixed(2) || precioTotal.toFixed(2)}</p>
                </div>
                {pago.place_to_pay_id && (
                  <div>
                    <p className="text-gray-600 text-sm">ID de transacción:</p>
                    <p className="font-medium">{pago.place_to_pay_id}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-600 text-sm">Fecha de reserva:</p>
                  <p className="font-medium">{fechaCreacion}</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between">
            <div>
              {reservacion.estado === 'Pendiente' && (
                <button
                  onClick={cancelarReservacion}
                  className="text-red-600 hover:underline"
                >
                  Cancelar reservación
                </button>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 mt-4 sm:mt-0">
              {reservacion.estado === 'Pendiente' && (
                <Link
                  href={`/pago/${reservacion.id}`}
                  className="bg-primary text-white px-4 py-2 rounded text-center hover:bg-opacity-90"
                >
                  Completar pago
                </Link>
              )}
              
              {reservacion.estado === 'Confirmada' && (
                <Link
                  href={`/boleto/${reservacion.id}`}
                  className="bg-primary text-white px-4 py-2 rounded text-center hover:bg-opacity-90"
                >
                  Ver boleto
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}