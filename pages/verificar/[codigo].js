// pages/verificar/[codigo].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function VerificarBoleto() {
  const router = useRouter();
  const { codigo } = router.query;
  
  const [loading, setLoading] = useState(true);
  const [reservacion, setReservacion] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Solo ejecutar si el código está disponible
    if (!codigo) return;

    const verificarReservacion = async () => {
      try {
        console.log(`Verificando boleto con código: ${codigo}`);
        
        // Buscar reservación usando el código de referencia
        const { data, error } = await supabase
          .from('reservaciones')
          .select(`
            id,
            fecha_viaje,
            estado,
            reference_code,
            created_at,
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
              estado
            )
          `)
          .eq('reference_code', codigo)
          .maybeSingle();

        if (error) {
          console.error('Error al verificar boleto:', error);
          throw new Error('Error al verificar el boleto');
        }
        
        if (!data) {
          console.log(`No se encontró boleto con código: ${codigo}`);
          setError('Boleto no encontrado. Verifique el código de referencia.');
        } else {
          console.log(`Boleto encontrado: ${data.reference_code}, estado: ${data.estado}`);
          setReservacion(data);
        }
      } catch (error) {
        console.error('Error:', error);
        setError(error.message || 'Error al verificar el boleto');
      } finally {
        setLoading(false);
      }
    };

    verificarReservacion();
  }, [codigo]);

  const formatFecha = (fechaStr) => {
    return new Date(fechaStr).toLocaleDateString('es-EC', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Verificando boleto...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto text-center py-10">
        <div className="bg-white rounded-lg shadow-md p-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-2xl font-bold mb-4">Verificación fallida</h2>
          <p className="mb-6 text-red-600">{error}</p>
          <Link href="/" className="bg-primary text-white px-6 py-2 rounded hover:bg-opacity-90">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (!reservacion) {
    return (
      <div className="max-w-md mx-auto text-center py-10">
        <div className="bg-white rounded-lg shadow-md p-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-yellow-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-2xl font-bold mb-4">Boleto no encontrado</h2>
          <p className="mb-6">No se encontró ningún boleto con el código proporcionado.</p>
          <Link href="/" className="bg-primary text-white px-6 py-2 rounded hover:bg-opacity-90">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  // Preparar datos para mostrar
  const asientosCount = reservacion.detalles_reservacion?.length || 0;
  const asientosNums = reservacion.detalles_reservacion
    ?.map(detalle => detalle.asientos?.numero)
    .filter(Boolean)
    .sort((a, b) => a - b)
    .join(', ');
  
  const fechaViaje = formatFecha(reservacion.fecha_viaje);
  const horaSalida = reservacion.horarios?.hora_salida?.substring(0, 5) || '';
  const origen = reservacion.horarios?.rutas?.origen || 'N/A';
  const destino = reservacion.horarios?.rutas?.destino || 'N/A';
  const bus = reservacion.horarios?.buses?.numero || 'N/A';
  const tipoBus = reservacion.horarios?.buses?.tipo || 'N/A';
  
  // Determinar el estado del boleto para mostrar con color adecuado
  const getEstadoBadge = () => {
    let bgColor, textColor, label;
    
    switch (reservacion.estado) {
      case 'Confirmada':
        bgColor = 'bg-green-100';
        textColor = 'text-green-800';
        label = 'Válido';
        break;
      case 'Pendiente':
        bgColor = 'bg-yellow-100';
        textColor = 'text-yellow-800';
        label = 'Pendiente de pago';
        break;
      case 'Cancelada':
        bgColor = 'bg-red-100';
        textColor = 'text-red-800';
        label = 'Cancelado';
        break;
      default:
        bgColor = 'bg-gray-100';
        textColor = 'text-gray-800';
        label = reservacion.estado;
    }
    
    return (
      <span className={`inline-block px-4 py-2 rounded-full text-base font-medium ${bgColor} ${textColor}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="max-w-lg mx-auto py-10">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-5 bg-primary text-white">
          <h1 className="text-2xl font-bold text-center">Verificación de Boleto</h1>
        </div>
        
        <div className="p-6">
          <div className="text-center mb-6">
            {reservacion.estado === 'Confirmada' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-yellow-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            
            <div className="mb-2">
              {getEstadoBadge()}
            </div>
            
            <p className="text-sm text-gray-600">
              Referencia: <span className="font-semibold">{reservacion.reference_code}</span>
            </p>
          </div>
          
          <div className="border-t border-b py-4 my-4">
            <h2 className="text-lg font-semibold mb-4 text-center">
              {origen} → {destino}
            </h2>
            
            <div className="grid grid-cols-2 gap-y-3">
              <div>
                <p className="text-gray-600 text-sm">Fecha:</p>
                <p className="font-medium">{fechaViaje}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Hora:</p>
                <p className="font-medium">{horaSalida}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Bus:</p>
                <p className="font-medium">{bus} - {tipoBus}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Asientos:</p>
                <p className="font-medium">{asientosCount} ({asientosNums})</p>
              </div>
            </div>
          </div>
          
          <div className="text-center pt-4">
            <p className="mb-6">
              {reservacion.estado === 'Confirmada'
                ? 'Este boleto es válido para el viaje indicado.'
                : 'Este boleto aún no está confirmado. Se requiere completar el pago.'}
            </p>
            
            <Link href="/" className="bg-primary text-white px-6 py-2 rounded hover:bg-opacity-90">
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}