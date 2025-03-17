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
        // Obtener sesión del usuario
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          toast.error('Debes iniciar sesión para completar el pago');
          router.push('/login');
          return;
        }
        
        setUser(session.user);

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

        if (reservacionError) throw reservacionError;
        
        // Verificar que la reservación pertenece al usuario
        if (reservacionData.usuario_id !== session.user.id) {
          toast.error('No tienes permiso para acceder a esta reservación');
          router.push('/reservaciones');
          return;
        }
        
        setReservacion(reservacionData);
        
        // Ordenar asientos por número
        const asientosOrdenados = reservacionData.detalles_reservacion
          .map(detalle => detalle.asientos)
          .sort((a, b) => a.numero - b.numero);
        
        setAsientos(asientosOrdenados);

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

        if (horarioError) throw horarioError;
        setHorario(horarioData);

        // Obtener datos de la ruta
        const { data: rutaData, error: rutaError } = await supabase
          .from('rutas')
          .select('*')
          .eq('id', horarioData.ruta_id)
          .single();

        if (rutaError) throw rutaError;
        setRuta(rutaData);

        // Obtener datos del pago
        const { data: pagoData, error: pagoError } = await supabase
          .from('pagos')
          .select('*')
          .eq('reservacion_id', id)
          .single();

        if (pagoError) throw pagoError;
        setPago(pagoData);

        // Si ya hay una URL de pago, redirigir automáticamente
        if (pagoData.url_redireccion && pagoData.estado === 'Pendiente') {
          window.location.href = pagoData.url_redireccion;
          return;
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
        expirationMinutes: 60
      };

      // Usar la API route en lugar de llamar directamente a createPaymentSession
      // Asegurarnos de usar el puerto correcto y la ruta correcta
      const apiUrl = `${window.location.origin}/api/place-to-pay`;
      console.log('Enviando solicitud a API:', apiUrl);
      
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
        throw new Error('Error al crear sesión de pago: respuesta inválida');
      }

      // Actualizar el registro de pago con la información de Place to Pay
      const { error: updateError } = await supabase
        .from('pagos')
        .update({
          place_to_pay_id: data.requestId,
          url_redireccion: data.processUrl,
          datos_pago: data
        })
        .eq('id', pago.id);

      if (updateError) throw updateError;

      // Redirigir al usuario a la página de pago de Place to Pay
      window.location.href = data.processUrl;
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
            <h2 className="text-lg font-semibold mb-2">Resumen de Pago</h2>
            
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