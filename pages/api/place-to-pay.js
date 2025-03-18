// pages/api/place-to-pay.js
import { createPaymentSession } from '../../lib/placeToPay';

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

    console.log('Iniciando solicitud a PlaceToPay con datos:', 
      JSON.stringify({
        ...paymentData,
        reference: paymentData.reference,
        amount: paymentData.amount,
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
          processUrl: response.processUrl ? '[URL generada]' : 'No disponible'
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