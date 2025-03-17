import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { getPaymentStatus } from '../../lib/placeToPay';
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
  
  // Verificar autenticación y cargar datos
  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        // Obtener sesión del usuario
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          toast.error('Debes iniciar sesión para ver los detalles del pago');
          router.push('/login');
          return;
        }
        
        setUser(session.user);

        // Obtener datos de reservación
        const { data: reservacionData, error: reservacionError } = await supabase
          .from('reservaciones')
          .select('*')
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

        // Obtener datos del pago
        const { data: pagoData, error: pagoError } = await supabase
          .from('pagos')
          .select('*')
          .eq('reservacion_id', id)
          .single();

        if (pagoError) throw pagoError;
        setPago(pagoData);

        // Verificar el estado del pago en Place to Pay
        await verificarPago(pagoData);
      } catch (error) {
        console.error('Error al cargar datos:', error);
        toast.error('Error al cargar información del pago');
        router.push('/reservaciones');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, router]);

  // Verificar estado del pago en Place to Pay
  const verificarPago = async (pagoData) => {
    if (!pagoData.place_to_pay_id) {
      setPagoStatus({ status: { status: 'ERROR', message: 'No hay información de pago disponible' } });
      return;
    }

    setVerificandoPago(true);
    
    try {
      const response = await getPaymentStatus(pagoData.place_to_pay_id);
      setPagoStatus(response);
      
      // Actualizar estado del pago en la base de datos según la respuesta de Place to Pay
      if (response.status.status === 'APPROVED') {
        // Actualizar pago a Aprobado
        await supabase
          .from('pagos')
          .update({
            estado: 'Aprobado',
            datos_pago: response
          })
          .eq('id', pagoData.id);
        
        // Actualizar estado de la reservación a Confirmada
        await supabase
          .from('reservaciones')
          .update({
            estado: 'Confirmada'
          })
          .eq('id', id);
      } else if (response.status.status === 'REJECTED') {
        // Actualizar pago a Rechazado
        await supabase
          .from('pagos')
          .update({
            estado: 'Rechazado',
            datos_pago: response
          })
          .eq('id', pagoData.id);
        
        // Actualizar estado de la reservación a Cancelada
        await supabase
          .from('reservaciones')
          .update({
            estado: 'Cancelada'
          })
          .eq('id', id);
      } else if (response.status.status === 'PENDING') {
        // Pago pendiente, actualizar datos
        await supabase
          .from('pagos')
          .update({
            datos_pago: response
          })
          .eq('id', pagoData.id);
      }
      
      // Actualizar el estado del pago en el componente
      const { data: updatedPago } = await supabase
        .from('pagos')
        .select('*')
        .eq('id', pagoData.id)
        .single();
      
      setPago(updatedPago);
      
      // Actualizar el estado de la reservación en el componente
      const { data: updatedReservacion } = await supabase
        .from('reservaciones')
        .select('*')
        .eq('id', id)
        .single();
      
      setReservacion(updatedReservacion);
    } catch (error) {
      console.error('Error al verificar pago:', error);
      toast.error('Error al verificar el estado del pago');
    } finally {
      setVerificandoPago(false);
    }
  };

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
    const statusMessage = pagoStatus?.status?.message || '';
    
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
          <p>Código de referencia: {reservacion.reference_code}</p>
          {pago.place_to_pay_id && (
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
                onClick={() => verificarPago(pago)}
                disabled={verificandoPago}
                className="border border-primary text-primary py-3 px-6 rounded text-center hover:bg-primary hover:bg-opacity-10 disabled:opacity-50"
              >
                {verificandoPago ? 'Verificando...' : 'Verificar estado de pago'}
              </button>
            )}
            
            {pago?.estado === 'Pendiente' && pago.url_redireccion && (
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
                href={`/pago/${id}`}
                className="text-center text-primary hover:underline"
              >
                Intentar pagar de nuevo
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