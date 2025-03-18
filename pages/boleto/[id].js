// pages/boleto/[id].js
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import QRCode from 'qrcode.react';

export default function Boleto() {
  const router = useRouter();
  const { id } = router.query;
  const boletoRef = useRef(null);
  
  const [loading, setLoading] = useState(true);
  const [reservacion, setReservacion] = useState(null);
  const [perfilUsuario, setPerfilUsuario] = useState(null);
  const [user, setUser] = useState(null);

  // Verificar autenticación y cargar datos
  useEffect(() => {
    // Solo ejecutar si id está disponible
    if (!id) return;

    const fetchData = async () => {
      try {
        console.log(`Iniciando carga de datos para boleto de reservación: ${id}`);
        
        // Obtener sesión del usuario
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          toast.error('Debes iniciar sesión para ver tu boleto');
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        console.log(`Usuario autenticado: ${session.user.id}`);

        // Cargar datos de la reservación SIN hacer join con usuario_id
        const { data: reservacionData, error: reservacionError } = await supabase
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
            )
          `)
          .eq('id', id)
          .single();

        if (reservacionError) {
          console.error('Error al cargar reservación:', reservacionError);
          throw reservacionError;
        }
        
        // Verificar que la reservación pertenece al usuario y está confirmada
        if (reservacionData.usuario_id !== session.user.id) {
          toast.error('No tienes permiso para ver este boleto');
          router.push('/reservaciones');
          return;
        }

        if (reservacionData.estado !== 'Confirmada') {
          toast.error('Este boleto no está confirmado. Completa el pago primero.');
          router.push(`/reserva/${id}`);
          return;
        }
        
        setReservacion(reservacionData);
        console.log('Reservación cargada correctamente');

        // Cargar perfil de usuario por separado
        const { data: perfilData, error: perfilError } = await supabase
          .from('profiles')
          .select('nombre, apellido, cedula')
          .eq('id', reservacionData.usuario_id)
          .single();

        if (perfilError) {
          console.error('Error al cargar perfil:', perfilError);
          // Continuamos aunque haya error en el perfil
        } else {
          setPerfilUsuario(perfilData);
          console.log('Perfil de usuario cargado correctamente');
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
        toast.error('Error al cargar información del boleto');
        router.push('/reservaciones');
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
    const [hora, minuto] = horaStr.split(':');
    let h = parseInt(hora);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; // Convertir a formato 12 horas
    return `${h}:${minuto} ${ampm}`;
  };

  // Imprimir boleto
  const imprimirBoleto = () => {
    const contenido = boletoRef.current;
    const ventanaImpresion = window.open('', '_blank');
    
    ventanaImpresion.document.write(`
      <html>
        <head>
          <title>Boleto de Viaje - ${reservacion.reference_code}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
            }
            .boleto {
              border: 1px solid #ccc;
              border-radius: 8px;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              border-bottom: 2px solid #0056b3;
              padding-bottom: 10px;
              margin-bottom: 20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #0056b3;
            }
            .info-viaje {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
            }
            .origen-destino {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 15px;
            }
            .asientos {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 1px dashed #ccc;
            }
            .footer {
              margin-top: 30px;
              font-size: 12px;
              color: #666;
              text-align: center;
            }
            .qr-code {
              display: flex;
              justify-content: center;
              margin-top: 20px;
            }
            @media print {
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          ${contenido.outerHTML}
          <div class="footer">
            <p>Este boleto es personal e intransferible. Preséntelo junto con su documento de identidad al momento de abordar.</p>
            <p>© ${new Date().getFullYear()} TransportApp Ecuador. Todos los derechos reservados.</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.setTimeout(function() {
                window.close();
              }, 500);
            }
          </script>
        </body>
      </html>
    `);
    
    ventanaImpresion.document.close();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Cargando tu boleto...</p>
        </div>
      </div>
    );
  }

  if (!reservacion) {
    return (
      <div className="max-w-4xl mx-auto text-center py-10">
        <h2 className="text-2xl font-bold mb-4">Boleto no encontrado</h2>
        <p className="mb-4">El boleto solicitado no existe o no tienes permiso para verlo.</p>
        <Link href="/reservaciones" className="text-primary hover:underline">
          Ver mis reservaciones
        </Link>
      </div>
    );
  }

  const horarioRuta = reservacion.horarios?.rutas || {};
  const horarioBus = reservacion.horarios?.buses || {};
  const asientos = reservacion.detalles_reservacion || [];
  
  // Construir una URL válida para el QR que lleve a la página de detalles de reserva
  const qrUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/reserva/${reservacion.id}` 
    : `/reserva/${reservacion.id}`;
  
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex justify-between items-center">
        <Link href={`/reserva/${reservacion.id}`} className="text-primary hover:underline flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Volver a detalles de reservación
        </Link>
        
        <button
          onClick={imprimirBoleto}
          className="flex items-center bg-primary text-white px-4 py-2 rounded hover:bg-opacity-90"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
          </svg>
          Imprimir boleto
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6" ref={boletoRef}>
        <div className="flex justify-between items-center border-b border-gray-200 pb-4 mb-6">
          <div className="text-xl font-bold text-primary">TransportApp Ecuador</div>
          <div className="text-gray-600">Boleto #{reservacion.reference_code}</div>
        </div>
        
        <div className="mb-6">
          <div className="text-2xl font-bold mb-2">
            {horarioRuta.origen} → {horarioRuta.destino}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-gray-600">Fecha de viaje:</p>
              <p className="font-medium">{formatFecha(reservacion.fecha_viaje)}</p>
            </div>
            <div>
              <p className="text-gray-600">Hora de salida:</p>
              <p className="font-medium">{formatHora(reservacion.horarios?.hora_salida)}</p>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="font-medium border-b pb-2 mb-2">Información del Bus</h3>
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
          
          <div>
            <h3 className="font-medium border-b pb-2 mb-2">Pasajero</h3>
            <p>
              <span className="text-gray-600">Nombre:</span> {perfilUsuario?.nombre || 'No disponible'} {perfilUsuario?.apellido || ''}
            </p>
            <p>
              <span className="text-gray-600">Cédula:</span> {perfilUsuario?.cedula || 'No disponible'}
            </p>
          </div>
        </div>
        
        <div className="border-t border-dashed pt-4 mb-6">
          <h3 className="font-medium mb-2">Asientos</h3>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {asientos.map(asiento => (
              <div key={asiento.id} className="bg-gray-100 rounded p-2 text-center w-16">
                <div className="text-lg font-bold">{asiento.asientos.numero}</div>
                <div className="text-xs text-gray-600">{asiento.asientos.tipo}</div>
              </div>
            ))}
          </div>
          
          <p className="text-sm text-gray-600">
            Precio total: ${(asientos.length * reservacion.horarios?.precio).toFixed(2)} USD
          </p>
        </div>
        
        <div className="flex justify-center">
          <div className="text-center">
            <QRCode 
              value={qrUrl}
              size={128}
              renderAs="svg"
              includeMargin={true}
            />
            <p className="text-sm text-gray-600 mt-2">Código de verificación</p>
            <p className="text-xs text-gray-500">{reservacion.reference_code}</p>
          </div>
        </div>
        
        <div className="text-xs text-gray-500 text-center mt-6">
          <p>Preséntese 30 minutos antes de la hora de salida. Documento de identidad requerido.</p>
          <p>Este boleto es su comprobante de viaje.</p>
        </div>
      </div>
    </div>
  );
}