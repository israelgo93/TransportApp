// pages/api/place-to-pay.js
import { createPaymentSession } from '../../lib/placeToPay';

export default async function handler(req, res) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Validar que tenemos todos los datos necesarios
    const paymentData = req.body;
    
    if (!paymentData.reference || !paymentData.amount || !paymentData.returnUrl) {
      return res.status(400).json({ 
        message: 'Datos incompletos. Se requiere reference, amount y returnUrl.' 
      });
    }

    console.log('Iniciando solicitud a PlaceToPay con datos:', 
      JSON.stringify({
        ...paymentData,
        // No mostrar datos sensibles en logs
        buyerEmail: paymentData.buyerEmail ? '***@***' : undefined
      })
    );

    // Imprimir las variables de entorno (ocultando valores sensibles)
    console.log('Variables de entorno disponibles:', {
      PLACE_TO_PAY_URL: process.env.PLACE_TO_PAY_URL ? 'configurado' : 'no configurado',
      PLACE_TO_PAY_LOGIN: process.env.PLACE_TO_PAY_LOGIN ? 'configurado' : 'no configurado',
      PLACE_TO_PAY_KEY: process.env.PLACE_TO_PAY_KEY ? 'configurado' : 'no configurado'
    });

    // Verificar explícitamente las variables de entorno antes de llamar a la función
    if (!process.env.PLACE_TO_PAY_URL || !process.env.PLACE_TO_PAY_LOGIN || !process.env.PLACE_TO_PAY_KEY) {
      console.error('Variables de entorno incompletas:', {
        URL: Boolean(process.env.PLACE_TO_PAY_URL),
        LOGIN: Boolean(process.env.PLACE_TO_PAY_LOGIN),
        KEY: Boolean(process.env.PLACE_TO_PAY_KEY)
      });
      return res.status(500).json({ 
        message: 'Error de configuración del servidor. Contacte al administrador.' 
      });
    }

    // Añadir la URL de notificación a los datos de pago
    // Esto es crucial para recibir notificaciones de PlaceToPay
    if (!paymentData.notificationUrl) {
      // Usar URL dinámica basada en la solicitud o variable de entorno
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                      `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      paymentData.notificationUrl = `${baseUrl}/api/notificacionPTP`; // Cambiado a notificacionPTP
      
      console.log(`Añadida URL de notificación: ${paymentData.notificationUrl}`);
    }

    // Llamar a la función que interactúa con PlaceToPay
    const response = await createPaymentSession(paymentData);
    
    console.log('Respuesta de PlaceToPay recibida:', 
      JSON.stringify({
        status: response.status,
        requestId: response.requestId,
        processUrl: response.processUrl ? '[URL generada]' : 'No disponible'
      })
    );

    // Devolver la respuesta al cliente
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error en API de PlaceToPay:', error.message);
    
    // Devolver un mensaje de error estructurado
    return res.status(500).json({ 
      message: 'Error al procesar la solicitud de pago',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}