// pages/api/payment-webhook.js
import { verifyNotificationSignature } from '../../lib/placeToPay';
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('Recibida notificación de PlaceToPay:', JSON.stringify(req.body, null, 2));
    
    const notification = req.body;
    
    // Verificar que tenemos los datos necesarios
    if (!notification || !notification.requestId || !notification.status) {
      console.error('Notificación inválida, faltan datos requeridos');
      return res.status(400).json({ message: 'Notificación inválida' });
    }
    
    // Verificar la firma de la notificación (opcional pero recomendado)
    if (notification.signature) {
      const isValid = verifyNotificationSignature(notification);
      if (!isValid) {
        console.error('Firma de notificación inválida');
        return res.status(403).json({ message: 'Firma inválida' });
      }
      console.log('Firma de notificación verificada correctamente');
    } else {
      console.warn('La notificación no incluye firma');
    }
    
    // Buscar pago asociado a este requestId
    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('id, reservacion_id, estado')
      .eq('place_to_pay_id', notification.requestId)
      .single();
    
    if (pagoError) {
      console.error('No se encontró pago asociado a este requestId:', notification.requestId);
      return res.status(404).json({ 
        message: 'No se encontró pago asociado a esta notificación' 
      });
    }
    
    console.log(`Pago encontrado: ${pago.id}, estado actual: ${pago.estado}, reservación: ${pago.reservacion_id}`);
    
    // Mapear el estado de la notificación a nuestro formato interno
    let dbStatus;
    let reservacionStatus;
    
    switch (notification.status.status) {
      case 'APPROVED':
      case 'APPROVED_PARTIAL':
        dbStatus = 'Aprobado';
        reservacionStatus = 'Confirmada';
        break;
      case 'REJECTED':
      case 'REJECTED_PARTIAL':
        dbStatus = 'Rechazado';
        reservacionStatus = 'Cancelada';
        break;
      case 'PENDING_VALIDATION':
      case 'PENDING':
      case 'REFUNDED':
      case 'PARTIAL_EXPIRED':
      case 'PARTIAL_REFUNDED':
      default:
        dbStatus = 'Pendiente';
        reservacionStatus = 'Pendiente';
    }
    
    console.log(`Actualizando pago a estado: ${dbStatus}, reservación a: ${reservacionStatus}`);
    
    // Actualizar el estado del pago
    const { error: updatePagoError } = await supabase
      .from('pagos')
      .update({
        estado: dbStatus,
        datos_pago: notification, // Guardar la notificación completa
        updated_at: new Date().toISOString()
      })
      .eq('id', pago.id);
    
    if (updatePagoError) {
      console.error('Error al actualizar pago:', updatePagoError);
      return res.status(500).json({ message: 'Error al actualizar pago' });
    }
    
    // Actualizar el estado de la reservación
    const { error: updateReservacionError } = await supabase
      .from('reservaciones')
      .update({
        estado: reservacionStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', pago.reservacion_id);
    
    if (updateReservacionError) {
      console.error('Error al actualizar reservación:', updateReservacionError);
      return res.status(500).json({ message: 'Error al actualizar reservación' });
    }
    
    console.log('Notificación procesada correctamente');
    
    // Devolver respuesta exitosa
    return res.status(200).json({ 
      message: 'Notificación procesada correctamente', 
      status: 'OK' 
    });
  } catch (error) {
    console.error('Error procesando notificación:', error);
    return res.status(500).json({ 
      message: 'Error interno del servidor',
      error: error.message
    });
  }
}