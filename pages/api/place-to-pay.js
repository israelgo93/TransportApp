// pages/api/place-to-pay.js
import { createPaymentSession } from '../../lib/placeToPay';

// Variable para rastrear solicitudes recientes y evitar duplicados
const recentRequests = new Map();
const REQUEST_THROTTLE = 5000; // 5 segundos entre solicitudes idénticas

export default async function handler(req, res) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Validar datos necesarios
    const paymentData = req.body;
    
    if (!paymentData.reference || !paymentData.amount || !paymentData.returnUrl) {
      return res.status(400).json({ 
        message: 'Datos incompletos. Se requiere reference, amount y returnUrl.' 
      });
    }

    // Crear un hash único para esta solicitud para evitar duplicados en envíos rápidos
    const requestHash = `${paymentData.reference}-${paymentData.amount}-${Date.now().toString().substring(0, 8)}`;
    
    // Verificar si es una solicitud duplicada reciente
    if (recentRequests.has(requestHash)) {
      console.log(`Solicitud duplicada detectada: ${requestHash}`);
      return res.status(429).json({
        message: 'Demasiadas solicitudes similares en poco tiempo. Por favor, espere un momento.'
      });
    }
    
    // Registrar esta solicitud para evitar duplicados
    recentRequests.set(requestHash, Date.now());
    
    // Limpiar solicitudes antiguas (más de 5 segundos)
    const now = Date.now();
    recentRequests.forEach((timestamp, key) => {
      if (now - timestamp > REQUEST_THROTTLE) {
        recentRequests.delete(key);
      }
    });
    
    console.log('Iniciando solicitud a PlaceToPay con referencia:', paymentData.reference);

    // Imprimir las variables de entorno (ocultando valores sensibles)
    console.log('Variables de entorno disponibles:', {
      PLACE_TO_PAY_URL: process.env.PLACE_TO_PAY_URL ? 'configurado' : 'no configurado',
      PLACE_TO_PAY_LOGIN: process.env.PLACE_TO_PAY_LOGIN ? 'configurado' : 'no configurado',
      PLACE_TO_PAY_KEY: process.env.PLACE_TO_PAY_KEY ? 'configurado' : 'no configurado'
    });

    // Verificar explícitamente las variables de entorno
    if (!process.env.PLACE_TO_PAY_URL || !process.env.PLACE_TO_PAY_LOGIN || !process.env.PLACE_TO_PAY_KEY) {
      console.error('Variables de entorno incompletas');
      return res.status(500).json({ 
        message: 'Error de configuración del servidor. Contacte al administrador.' 
      });
    }

    // Asegurar que notificationUrl esté presente
    if (!paymentData.notificationUrl) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                      `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      paymentData.notificationUrl = `${baseUrl}/api/notificacionPTP`;
      
      console.log(`Añadida URL de notificación: ${paymentData.notificationUrl}`);
    }

    // Llamar a PlaceToPay para crear la sesión
    try {
      const response = await createPaymentSession(paymentData);
      
      console.log('Respuesta de PlaceToPay recibida:', 
        JSON.stringify({
          status: response.status?.status,
          requestId: response.requestId,
          hasProcessUrl: !!response.processUrl
        })
      );

      // Verificar explícitamente que tenemos el requestId
      if (!response.requestId) {
        console.error('No se recibió requestId de PlaceToPay');
        return res.status(500).json({
          message: 'Error en respuesta de PlaceToPay: no se recibió requestId'
        });
      }

      // Devolver la respuesta al cliente
      return res.status(200).json(response);
    } catch (ptpError) {
      console.error('Error específico de PlaceToPay:', ptpError);
      
      // Manejar errores específicos de PlaceToPay
      if (ptpError.response && ptpError.response.status === 401) {
        return res.status(401).json({
          message: 'Error de autenticación con PlaceToPay. Verifique las credenciales.',
          error: ptpError.message
        });
      }
      
      return res.status(500).json({
        message: 'Error al comunicarse con PlaceToPay',
        error: ptpError.message
      });
    }
  } catch (error) {
    console.error('Error en API de PlaceToPay:', error.message);
    
    // Devolver un mensaje de error estructurado
    return res.status(500).json({ 
      message: 'Error al procesar la solicitud de pago',
      error: error.message
    });
  }
}