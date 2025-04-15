// pages/boleto/[id].js - Versión actualizada con soporte para código de barras
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import QRCode from 'qrcode.react';
import { navigateTo } from '../../lib/navigationService';
import { useAuth } from '../../lib/AuthContext'; // Contexto centralizado de auth
import JsBarcode from 'jsbarcode'; // Librería para generar códigos de barras

export default function Boleto() {
  const boletoRef = useRef(null);
  const barcodeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [reservacion, setReservacion] = useState(null);
  const [error, setError] = useState(null);
  const [codigoBarras, setCodigoBarras] = useState('');
  
  // Usar contexto de autenticación centralizado
  const { user, profile, loading: authLoading } = useAuth();
  
  // Obtener el ID de la reservación de la URL
  const { id } = useParams();

  // useParams hook personalizado para obtener parámetros de ruta
  function useParams() {
    const router = typeof window !== 'undefined' ? 
      require('next/router').useRouter() : { query: {} };
    return router.query || {};
  }

  // Generar código de barras único para esta reservación
  const generarCodigoBarras = useCallback(async (reservacionId, referenceCode) => {
    try {
      // Verificar si ya existe un código de barras para esta reservación
      const { data: existingBarcode, error: queryError } = await supabase
        .from('codigos_barras_boletos')
        .select('codigo_barras')
        .eq('reservacion_id', reservacionId)
        .maybeSingle();
      
      if (queryError) {
        console.error('Error al verificar código de barras existente:', queryError);
        throw queryError;
      }
      
      // Si ya existe, usar ese código
      if (existingBarcode) {
        console.log('Usando código de barras existente:', existingBarcode.codigo_barras);
        return existingBarcode.codigo_barras;
      }
      
      // Si no existe, generar un nuevo código de barras
      // Formato: BCRES seguido de 8-10 caracteres alfanuméricos (evitar guiones)
      // Limpiamos el reference_code de cualquier carácter no alfanumérico
      const cleanRef = referenceCode.replace(/[^A-Z0-9]/g, '');
      const shortRef = cleanRef.substring(0, 4);
      
      // Generar un timestamp usando hexadecimal para hacerlo más corto
      const timestamp = Date.now().toString(16).toUpperCase();
      
      // Combinar para crear un código único
      // BCRES es el prefijo para identificar que es un código de barras
      const newBarcode = `BCRES${shortRef}${timestamp}`;
      
      console.log('Generando nuevo código de barras:', newBarcode);
      
      // Guardar el nuevo código en la base de datos
      const { error: insertError } = await supabase
        .from('codigos_barras_boletos')
        .insert({
          reservacion_id: reservacionId,
          codigo_barras: newBarcode
        });
      
      if (insertError) {
        console.error('Error al guardar código de barras:', insertError);
        throw insertError;
      }
      
      return newBarcode;
    } catch (error) {
      console.error('Error al generar código de barras:', error);
      // Retornar un código generado localmente como fallback
      const fallbackCode = `BCRES${Math.random().toString(16).substring(2, 10).toUpperCase()}`;
      console.log('Usando código fallback:', fallbackCode);
      return fallbackCode;
    }
  }, []);

  // Efecto para cargar datos de la reservación
  useEffect(() => {
    // Solo ejecutar si id está disponible y tenemos usuario autenticado
    if (!id || authLoading) return;

    // Si no hay usuario después de verificar autenticación, redirigir a login
    if (!user && !authLoading) {
      toast.error('Debes iniciar sesión para ver tu boleto');
      navigateTo(`/login?redirect=${encodeURIComponent(`/boleto/${id}`)}`);
      return;
    }

    const fetchData = async () => {
      try {
        console.log(`Iniciando carga de datos para boleto de reservación: ${id}`);
        
        // Cargar datos de la reservación SIN hacer join con usuario_id para minimizar datos
        const { data: reservacionData, error: reservacionError } = await supabase
          .from('reservaciones')
          .select(`
            id,
            fecha_viaje,
            estado,
            reference_code,
            created_at,
            usuario_id,
            boleto_validado,
            fecha_validacion,
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
        if (reservacionData.usuario_id !== user.id) {
          toast.error('No tienes permiso para ver este boleto');
          navigateTo('/reservaciones');
          return;
        }

        if (reservacionData.estado !== 'Confirmada') {
          toast.error('Este boleto no está confirmado. Completa el pago primero.');
          navigateTo(`/reserva/${id}`);
          return;
        }
        
        setReservacion(reservacionData);
        console.log('Reservación cargada correctamente');
        
        // Generar o recuperar el código de barras
        const barcode = await generarCodigoBarras(
          reservacionData.id,
          reservacionData.reference_code
        );
        
        setCodigoBarras(barcode);
        
        // Renderizar el código de barras cuando esté disponible
        if (barcode && barcodeRef.current) {
          try {
            JsBarcode(barcodeRef.current, barcode, {
              format: "CODE128",
              width: 2,
              height: 50,
              displayValue: true,
              text: barcode,
              font: "monospace",
              fontSize: 14,
              textMargin: 2,
              background: "white",
            });
          } catch (barcodeError) {
            console.error('Error al generar imagen de código de barras:', barcodeError);
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error al cargar datos:', error);
        setError('Error al cargar información del boleto');
        toast.error('Error al cargar información del boleto');
        setLoading(false);
      }
    };

    fetchData();
  }, [id, user, authLoading, generarCodigoBarras]);

  // Efecto para renderizar el código de barras cuando cambie
  useEffect(() => {
    if (codigoBarras && barcodeRef.current) {
      try {
        // Mejorar configuración para mayor compatibilidad con escáneres
        JsBarcode(barcodeRef.current, codigoBarras, {
          format: "CODE128",
          width: 3,             // Aumentamos el ancho para mejor legibilidad
          height: 80,           // Aumentamos la altura para mejor escaneo
          displayValue: true,   // Mostrar el valor del código
          text: codigoBarras,   // Texto que se muestra debajo
          font: "monospace",    // Fuente legible para operadores
          fontSize: 16,         // Tamaño de fuente aumentado
          textMargin: 4,        // Mayor espacio para el texto
          margin: 10,           // Más margen alrededor del código
          background: "white",  // Fondo blanco para mejor contraste
          lineColor: "#000000", // Negro puro para líneas
          textAlign: "center",  // Centrar el texto
          flat: false           // Proporciona un mejor renderizado para escáneres
        });
      } catch (error) {
        console.error('Error al renderizar código de barras:', error);
      }
    }
  }, [codigoBarras]);

  // Formatear fecha (memoizada para evitar recálculos)
  const formatFecha = useCallback((fechaStr) => {
    return new Date(fechaStr).toLocaleDateString('es-EC', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, []);

  // Formatear hora (memoizada para evitar recálculos)
  const formatHora = useCallback((horaStr) => {
    if (!horaStr) return '';
    const [hora, minuto] = horaStr.split(':');
    let h = parseInt(hora);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; // Convertir a formato 12 horas
    return `${h}:${minuto} ${ampm}`;
  }, []);

  // Imprimir boleto
  const imprimirBoleto = useCallback(() => {
    if (!boletoRef.current) return;
    
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
            .qr-code, .barcode {
              display: flex;
              justify-content: center;
              margin-top: 20px;
            }
            @media print {
              .no-print {
                display: none;
              }
            }
            .codes-container {
              display: flex;
              justify-content: space-around;
              flex-wrap: wrap;
              margin-top: 20px;
            }
            .code-box {
              text-align: center;
              margin: 10px;
            }
            .code-label {
              font-size: 12px;
              color: #666;
              margin-top: 5px;
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
  }, [reservacion]);

  // Contenido de carga (memoizado para evitar recreaciones)
  const loadingContent = useMemo(() => (
    <div className="flex justify-center items-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4">Cargando tu boleto...</p>
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

  // Contenido no encontrado (memoizado)
  const notFoundContent = useMemo(() => (
    <div className="max-w-4xl mx-auto text-center py-10">
      <h2 className="text-2xl font-bold mb-4">Boleto no encontrado</h2>
      <p className="mb-4">El boleto solicitado no existe o no tienes permiso para verlo.</p>
      <Link href="/reservaciones" className="text-primary hover:underline">
        Ver mis reservaciones
      </Link>
    </div>
  ), []);

  // Mostrar pantalla de carga mientras se verifica autenticación
  if (authLoading || loading) {
    return loadingContent;
  }

  // Mostrar error si ocurrió alguno
  if (error) {
    return errorContent;
  }

  // Mostrar mensaje si no se encontró la reservación
  if (!reservacion) {
    return notFoundContent;
  }

  // Datos extraídos de la reservación (para mejor legibilidad)
  const horarioRuta = reservacion.horarios?.rutas || {};
  const horarioBus = reservacion.horarios?.buses || {};
  const asientos = reservacion.detalles_reservacion || [];
  
  // Construir una URL válida para el QR que lleve a la página de verificación
  const qrUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/verificar/${reservacion.reference_code}` 
    : `/verificar/${reservacion.reference_code}`;
  
  // Indicador de estado de validación
  const getBoletoEstado = () => {
    if (reservacion.boleto_validado) {
      return (
        <div className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium inline-block">
          Boleto utilizado el {new Date(reservacion.fecha_validacion).toLocaleString()}
        </div>
      );
    }
    
    const fechaViaje = new Date(reservacion.fecha_viaje);
    fechaViaje.setHours(23, 59, 59, 999);
    const hoy = new Date();
    
    if (fechaViaje < hoy) {
      return (
        <div className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium inline-block">
          Boleto caducado
        </div>
      );
    }
    
    return (
      <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium inline-block">
        Boleto válido
      </div>
    );
  };
  
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
        
        {/* Estado del boleto */}
        <div className="text-center mb-6">
          {getBoletoEstado()}
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
              <span className="text-gray-600">Nombre:</span> {profile?.nombre || 'No disponible'} {profile?.apellido || ''}
            </p>
            <p>
              <span className="text-gray-600">Cédula:</span> {profile?.cedula || 'No disponible'}
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
        
        {/* Contenedor para QR y código de barras */}
        <div className="codes-container flex justify-around flex-wrap border-t pt-6">
          <div className="code-box">
            <QRCode 
              value={qrUrl}
              size={128}
              renderAs="svg"
              includeMargin={true}
            />
            <p className="code-label mt-2">Código QR de verificación</p>
            <p className="text-xs text-gray-500">{reservacion.reference_code}</p>
          </div>
          
          <div className="code-box">
            <svg ref={barcodeRef} className="barcode"></svg>
            <p className="code-label mt-2">Código de barras</p>
            {/* Mostrar el código de forma visible para verificación manual si es necesario */}
            <p className="text-xs text-gray-500">{codigoBarras}</p>
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