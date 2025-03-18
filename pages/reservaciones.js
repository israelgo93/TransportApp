// pages/reservaciones.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

export default function Reservaciones() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reservaciones, setReservaciones] = useState([]);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);

  // Verificar autenticación - Modificado para prevenir llamadas múltiples
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('Verificando autenticación...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          throw sessionError;
        }
        
        if (!session) {
          console.log('No hay sesión activa, redirigiendo a login');
          toast.error('Debes iniciar sesión para ver tus reservaciones');
          router.push('/login?redirect=/reservaciones');
          return;
        }
        
        console.log(`Usuario autenticado: ${session.user.id}`);
        setUser(session.user);
        // Llamar a fetchReservaciones directamente aquí
        // en lugar de usar otro useEffect que dependa de user
        fetchReservaciones(session.user.id);
      } catch (error) {
        console.error('Error de autenticación:', error);
        setError('Error al verificar la sesión');
        toast.error('Error al verificar la sesión');
        router.push('/login');
      }
    };

    checkAuth();
    
    // No agregar user al arreglo de dependencias para evitar
    // que se ejecute múltiples veces
  }, [router]);

  // Cargar reservaciones del usuario
  const fetchReservaciones = async (userId) => {
    try {
      console.log(`Cargando reservaciones para usuario: ${userId}`);
      
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
            rutas:ruta_id (
              id,
              origen,
              destino
            ),
            buses:bus_id (
              id,
              numero,
              tipo
            )
          ),
          detalles_reservacion (
            id,
            asientos:asiento_id (
              id,
              numero
            )
          ),
          pagos (
            id,
            monto,
            estado,
            place_to_pay_id
          )
        `)
        .eq('usuario_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al cargar reservaciones:', error);
        throw error;
      }
      
      console.log(`${data?.length || 0} reservaciones encontradas`);
      
      // Verificación adicional de seguridad
      const filteredData = data.filter(res => res.usuario_id === userId);
      if (filteredData.length !== data.length) {
        console.warn('¡Alerta! Se filtraron reservaciones que no pertenecen al usuario');
      }
      
      setReservaciones(filteredData || []);
    } catch (error) {
      console.error('Error al cargar reservaciones:', error);
      setError('Error al cargar tus reservaciones');
      toast.error('Error al cargar tus reservaciones');
    } finally {
      setLoading(false);
    }
  };

  // Formatear estado con color adecuado
  const getEstadoDisplay = (estado) => {
    switch (estado) {
      case 'Confirmada':
        return (
          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
            Confirmada
          </span>
        );
      case 'Pendiente':
        return (
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
            Pendiente
          </span>
        );
      case 'Cancelada':
        return (
          <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
            Cancelada
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
            {estado}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Cargando tus reservaciones...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-100 p-4 rounded-lg text-red-700 mb-4">
          <p>{error}</p>
        </div>
        <div className="flex justify-center">
          <Link href="/" className="text-primary hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Mis Reservaciones</h1>
      
      {reservaciones.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <p className="text-gray-600 mb-4">No tienes reservaciones activas.</p>
          <Link href="/" className="text-primary hover:underline">
            Buscar pasajes
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {reservaciones.map((reserva) => {
            const numAsientos = reserva.detalles_reservacion?.length || 0;
            const asientosNums = reserva.detalles_reservacion
              ?.map(detalle => detalle.asientos?.numero)
              .filter(Boolean)
              .sort((a, b) => a - b)
              .join(', ');
            
            const fechaViaje = new Date(reserva.fecha_viaje).toLocaleDateString('es-EC', {
              weekday: 'long',
              year: 'numeric', 
              month: 'long', 
              day: 'numeric'
            });
            
            const horaSalida = reserva.horarios?.hora_salida?.substring(0, 5) || '';
            
            // Manejo seguro de pagos - verificar que pagos existe y tiene al menos un elemento
            const hasPagos = reserva.pagos && reserva.pagos.length > 0;
            const pago = hasPagos ? reserva.pagos[0] : null;
            const montoTotal = pago?.monto || 0;
            
            // Calcular el precio total basado en el precio del horario y el número de asientos
            // como alternativa al monto del pago (por si no hay pagos registrados)
            const precioUnitario = reserva.horarios?.precio || 0;
            const precioCalculado = precioUnitario * numAsientos;
            
            return (
              <div key={reserva.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                  <h3 className="font-semibold">
                    {reserva.horarios?.rutas?.origen || 'Origen'} → {reserva.horarios?.rutas?.destino || 'Destino'}
                  </h3>
                  {getEstadoDisplay(reserva.estado)}
                </div>
                
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-600">Fecha y hora:</p>
                      <p>{fechaViaje} - {horaSalida}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Bus:</p>
                      <p>{reserva.horarios?.buses?.numero || 'N/A'} - {reserva.horarios?.buses?.tipo || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Asientos ({numAsientos}):</p>
                      <p>{asientosNums || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Referencia:</p>
                      <p>{reserva.reference_code}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row justify-between items-center pt-3 border-t">
                    <div className="mb-3 sm:mb-0">
                      <p className="text-sm text-gray-600">Total:</p>
                      <p className="font-bold text-lg text-primary">
                        ${hasPagos && montoTotal ? montoTotal.toFixed(2) : precioCalculado.toFixed(2)}
                      </p>
                    </div>
                    
                    <div className="flex space-x-3">
                      {reserva.estado === 'Pendiente' && (
                        <Link 
                          href={`/pago/${reserva.id}`}
                          className="px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90"
                        >
                          Completar pago
                        </Link>
                      )}
                      
                      {reserva.estado === 'Confirmada' && (
                        <Link 
                          href={`/boleto/${reserva.id}`}
                          className="px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90"
                        >
                          Ver boleto
                        </Link>
                      )}
                      
                      <Link 
                        href={`/reserva/${reserva.id}`}
                        className="px-4 py-2 border border-primary text-primary rounded hover:bg-primary hover:bg-opacity-10"
                      >
                        Detalles
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}