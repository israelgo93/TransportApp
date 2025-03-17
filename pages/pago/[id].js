// pages/pago/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export default function Pago() {
  const router = useRouter();
  const { id } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [procesandoPago, setProcesandoPago] = useState(false);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [reservacion, setReservacion] = useState(null);
  const [horario, setHorario] = useState(null);
  const [ruta, setRuta] = useState(null);
  const [pago, setPago] = useState(null);
  const [asientos, setAsientos] = useState([]);

  // Verificar autenticación y cargar datos
  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        console.log(`Iniciando carga de datos para reservación: ${id}`);
        
        // Obtener sesión del usuario
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          toast.error('Debes iniciar sesión para completar el pago');
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        console.log(`Usuario autenticado: ${session.user.id}`);

        // Obtener el perfil del usuario
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          console.error('Error al cargar perfil de usuario:', profileError);
        } else {
          setUserProfile(profileData);
          console.log('Perfil de usuario cargado:', profileData.nombre, profileData.apellido);
        }

        // Obtener datos de reservación
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
        if (String(reservacionData.usuario_id) !== String(session.user.id)) {
          console.error(`Intento de acceso no autorizado. Reserva: ${reservacionData.id}, Usuario: ${session.user.id}`);
          toast.error('No tienes permiso para acceder a esta reservación');
          router.push('/reservaciones');
          return;
        }
        
        console.log(`Reservación cargada: ${reservacionData.reference_code}`);
        setReservacion(reservacionData);
        
        // Ordenar asientos por número
        const asientosOrdenados = reservacionData.detalles_reservacion
          .map(detalle => detalle.asientos)
          .filter(asiento => asiento) // Filtrar posibles nulos
          .sort((a, b) => a.numero - b.numero);
        
        setAsientos(asientosOrdenados);
        console.log(`${asientosOrdenados.length} asientos reservados`);

        // Obtener datos del horario
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
        
        setRuta(rutaData);
        console.log(`Ruta cargada: ${rutaData.origen} → ${rutaData.destino}`);

        // Obtener datos del pago
        const { data: pagoData, error: pagoError } = await supabase
          .from('pagos')
          .select('*')
          .eq('reservacion_id', id)
          .single();

        if (pagoError) {
          // Si no existe un pago, lo creamos
          if (pagoError.code === 'PGRST116') {
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
                estado: 'Pendiente'
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
            throw pagoError;
          }
        } else {
          console.log(`Pago existente cargado, id: ${pagoData.id}, estado: ${pagoData.estado}`);
          setPago(pagoData);
          
          // Si ya hay una URL de pago válida y el pago está pendiente, redirigir automáticamente
          if (pagoData.url_redireccion && pagoData.estado === 'Pendiente' && !router.query.retry) {
            console.log('Redirigiendo a la URL de pago existente:', pagoData.url_redireccion);
            window.location.href = pagoData.url_redireccion;
            return;
          }
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
        toast.error('Error al cargar información de la reservación');
        router.push('/reservaciones');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, router]);

  // Iniciar el proceso de pago
  // Función iniciarPago actualizada para pages/pago/[id].js
  const iniciarPago = async () => {
    if (!reservacion || !pago || !user) {
      toast.error('Información de reserva incompleta');
      return;
    }

    // Verificar que tenemos el ID de reservación
    console.log("ID de reservación:", id);
    console.log("Datos de reservación:", reservacion);

    setProcesandoPago(true);
    
    try {
      // Obtener datos del perfil del usuario
      const { data: perfilData, error: perfilError } = await supabase
        .from('profiles')
        .select('nombre, apellido, cedula, telefono')
        .eq('id', user.id)
        .single();

      if (perfilError) throw perfilError;

      // Crear sesión de pago en Place to Pay a través de API route
      const returnUrl = `${window.location.origin}/pago-resultado/${reservacion.id}`;
      const notificationUrl = `${window.location.origin}/api/notificacionPTP`; // URL del webhook corregida
      
      const paymentData = {
        reference: reservacion.reference_code,
        description: `Reserva de pasajes: ${ruta.origen} a ${ruta.destino}`,
        amount: pago.monto,
        currency: 'USD',
        buyerEmail: user.email,
        buyerName: perfilData.nombre || 'Cliente',
        buyerSurname: perfilData.apellido || 'Web',
        buyerDocument: perfilData.cedula || '0000000000',
        buyerDocumentType: 'CC',
        returnUrl,
        notificationUrl,
        expirationMinutes: 60
      };

      // Usar la API route en lugar de llamar directamente a createPaymentSession
      const apiUrl = `${window.location.origin}/api/place-to-pay`;
      console.log('Enviando solicitud a API:', apiUrl);
      console.log('Datos de pago:', JSON.stringify({
        ...paymentData,
        buyerEmail: '***@***' // Ocultamos el email por seguridad
      }));
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error en respuesta API:', errorText);
        throw new Error(`Error al crear sesión de pago: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data || data.status?.status !== 'OK') {
        console.error('Respuesta inválida de PlaceToPay:', data);
        throw new Error('Error al crear sesión de pago: respuesta inválida');
      }

      console.log('Respuesta de PlaceToPay completa:', data);
      console.log('Respuesta de PlaceToPay:', {
        status: data.status?.status,
        requestId: data.requestId,
        processUrl: data.processUrl ? 'URL disponible' : 'URL no disponible'
      });

      // PUNTO CRÍTICO: Actualizar el registro de pago con la información de Place to Pay
      // Asegurarnos de que el requestId se guarde correctamente
      const requestId = data.requestId;
      
      if (!requestId) {
        console.error('No se recibió requestId de PlaceToPay');
        throw new Error('Error al crear sesión de pago: no se recibió requestId');
      }
      
      console.log(`Actualizando pago ${pago.id} con requestId: ${requestId}`);
      
      const { error: updateError } = await supabase
        .from('pagos')
        .update({
          place_to_pay_id: requestId,
          url_redireccion: data.processUrl,
          datos_pago: data
        })
        .eq('id', pago.id);

      if (updateError) {
        console.error('Error al actualizar registro de pago:', updateError);
        throw updateError;
      }

      // Verificar que el pago se actualizó correctamente
      const { data: pagoActualizado, error: verificacionError } = await supabase
        .from('pagos')
        .select('*')
        .eq('id', pago.id)
        .single();
      
      if (verificacionError) {
        console.error('Error al verificar actualización del pago:', verificacionError);
      } else {
        console.log('Pago actualizado correctamente:', {
          id: pagoActualizado.id,
          place_to_pay_id: pagoActualizado.place_to_pay_id
        });
      }

      // Redirigir a la página de PlaceToPay incluyendo el requestId en la URL de retorno
      const processUrl = new URL(data.processUrl);
      if (!processUrl.searchParams.has('requestId')) {
        processUrl.searchParams.append('requestId', requestId);
      }

      console.log(`Redirigiendo a PlaceToPay: ${processUrl.toString()}`);
      window.location.href = processUrl.toString();
    } catch (error) {
      console.error('Error al iniciar pago:', error);
      toast.error('Error al procesar el pago. Inténtalo nuevamente.');
    } finally {
      setProcesandoPago(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Cargando información de pago...</p>
        </div>
      </div>
    );
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
                  <p className="font-medium">{ruta.origen} → {ruta.destino}</p>
                </div>
                <div>
                  <p className="text-gray-600">Fecha:</p>
                  <p className="font-medium">{new Date(reservacion.fecha_viaje).toLocaleDateString('es-EC')}</p>
                </div>
                <div>
                  <p className="text-gray-600">Hora de Salida:</p>
                  <p className="font-medium">{horario.hora_salida.substring(0, 5)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Bus:</p>
                  <p className="font-medium">{horario.buses.numero} - {horario.buses.tipo}</p>
                </div>
                <div>
                  <p className="text-gray-600">Asientos:</p>
                  <p className="font-medium">
                    {asientos.map(asiento => asiento.numero).join(', ')}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Código de Referencia:</p>
                  <p className="font-medium">{reservacion.reference_code}</p>
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
                  <p className="font-medium">{userProfile?.nombre} {userProfile?.apellido}</p>
                </div>
                <div>
                  <p className="text-gray-600">Cédula:</p>
                  <p className="font-medium">{userProfile?.cedula || 'No disponible'}</p>
                </div>
                <div>
                  <p className="text-gray-600">Email:</p>
                  <p className="font-medium">{user?.email}</p>
                </div>
                <div>
                  <p className="text-gray-600">Teléfono:</p>
                  <p className="font-medium">{userProfile?.telefono || 'No disponible'}</p>
                </div>
              </div>
              
              {(!userProfile?.nombre || !userProfile?.apellido || !userProfile?.cedula) && (
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
                <span>${(pago.monto).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>Total:</span>
                <span className="text-primary">${pago.monto.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col space-y-4">
            <button
              onClick={iniciarPago}
              disabled={procesandoPago}
              className="bg-primary text-white py-3 px-6 rounded hover:bg-opacity-90 disabled:opacity-50 transition"
            >
              {procesandoPago ? 'Procesando...' : 'Pagar con Place to Pay'}
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