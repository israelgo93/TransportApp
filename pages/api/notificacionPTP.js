// pages/api/notificacionPTP.js
import { supabase } from '../../lib/supabase';
import crypto from 'crypto';

export default async function handler(req, res) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    console.log('Método no permitido:', req.method);
    return res.status(405).end(); // Method Not Allowed
  }

  try {
    console.log('Recibida notificación de PlaceToPay:', JSON.stringify(req.body, null, 2));
    const data = req.body;
    const { requestId, reference, signature, status } = data;

    // Verificar que tenemos todos los datos necesarios
    if (!requestId || !reference || !signature || !status || !status.status || !status.date) {
      console.error('Datos incompletos en la notificación:', data);
      return res.status(400).end(); // Bad Request
    }

    console.log(`Notificación para requestId: ${requestId}, referencia: ${reference}, estado: ${status.status}`);

    // Obtener el secretKey de las variables de entorno
    const secretKey = process.env.PLACE_TO_PAY_KEY;
    if (!secretKey) {
      console.error('PLACE_TO_PAY_KEY no está configurado');
      return res.status(500).end(); // Internal Server Error
    }

    // Verificar la firma
    const calculatedSignature = crypto
      .createHash('sha1')
      .update(requestId + status.status + status.date + secretKey)
      .digest('hex');

    if (calculatedSignature !== signature) {
      console.error('Firma inválida. Recibida:', signature, 'Calculada:', calculatedSignature);
      return res.status(401).end(); // Unauthorized
    }

    console.log('Firma verificada correctamente');

    // PASO 1: Intentar buscar primero por requestId
    let { data: pagoByRequestId, error: pagoByRequestIdError } = await supabase
      .from('pagos')
      .select('*')
      .eq('place_to_pay_id', requestId)
      .single();

    if (pagoByRequestIdError) {
      console.log('No se encontró pago por requestId, intentando buscar por referencia');
      
      // PASO 2: Si no encontramos por requestId, buscamos por referencia
      // El formato es .from('reservaciones').select().ilike('reference_code', reference)
      // Usamos ilike en lugar de eq para hacer una búsqueda insensible a mayúsculas/minúsculas
      const { data: reservaciones, error: reservacionesError } = await supabase
        .from('reservaciones')
        .select('id, reference_code')
        .ilike('reference_code', reference);
      
      if (reservacionesError || !reservaciones || reservaciones.length === 0) {
        console.error('Error al buscar reservaciones por referencia:', reservacionesError || 'No se encontraron reservaciones');
        console.log('Verificando todas las reservaciones recientes:');
        
        // PASO 3: Si aún no la encontramos, buscar las últimas reservaciones para depuración
        const { data: allReservaciones } = await supabase
          .from('reservaciones')
          .select('id, reference_code')
          .order('created_at', { ascending: false })
          .limit(5);
        
        console.log('Últimas reservaciones:', allReservaciones);
        return res.status(200).end(); // Respondemos 200 aunque no encontremos la reservación
      }
      
      console.log('Reservaciones encontradas:', reservaciones);
      
      // Si encontramos múltiples reservaciones con referencia similar, tomamos la primera
      const reservacion = reservaciones[0];
      console.log('Usando reservación:', reservacion);
      
      // Buscamos el pago asociado a esta reservación
      const { data: pagoPorReservacion, error: pagoReservacionError } = await supabase
        .from('pagos')
        .select('*')
        .eq('reservacion_id', reservacion.id)
        .single();
      
      if (pagoReservacionError) {
        console.error('Error al buscar pago por reservación:', pagoReservacionError);
        return res.status(200).end(); // Respondemos 200 aunque haya error
      }
      
      pagoByRequestId = pagoPorReservacion;
      
      // Actualizar el place_to_pay_id si no estaba guardado
      if (pagoByRequestId && !pagoByRequestId.place_to_pay_id) {
        const { error: updateIdError } = await supabase
          .from('pagos')
          .update({ place_to_pay_id: requestId })
          .eq('id', pagoByRequestId.id);
          
        if (updateIdError) {
          console.error('Error al actualizar place_to_pay_id:', updateIdError);
        } else {
          console.log(`place_to_pay_id actualizado a ${requestId} para el pago ${pagoByRequestId.id}`);
          pagoByRequestId.place_to_pay_id = requestId;
        }
      }
    }

    if (!pagoByRequestId) {
      console.error('No se pudo encontrar el pago');
      return res.status(200).end(); // Respondemos 200 aunque no encontremos el pago
    }

    console.log(`Pago encontrado con ID: ${pagoByRequestId.id}, estado actual: ${pagoByRequestId.estado}`);

    // Actualizar el estado del pago
    let nuevoEstado;
    switch (status.status) {
      case 'APPROVED':
      case 'APPROVED_PARTIAL':
        nuevoEstado = 'Aprobado';
        break;
      case 'REJECTED':
      case 'REJECTED_PARTIAL':
        nuevoEstado = 'Rechazado';
        break;
      default:
        nuevoEstado = 'Pendiente';
    }

    const { error: updateError } = await supabase
      .from('pagos')
      .update({
        estado: nuevoEstado,
        datos_pago: data,
        updated_at: new Date().toISOString()
      })
      .eq('id', pagoByRequestId.id);

    if (updateError) {
      console.error('Error al actualizar el pago:', updateError);
      return res.status(200).end(); // Internal Server Error
    }

    console.log(`Pago actualizado a estado: ${nuevoEstado}`);

    // Si el pago está aprobado, actualizar también la reservación
    if (status.status === 'APPROVED' || status.status === 'APPROVED_PARTIAL') {
      const { error: reservaError } = await supabase
        .from('reservaciones')
        .update({
          estado: 'Confirmada',
          updated_at: new Date().toISOString()
        })
        .eq('id', pagoByRequestId.reservacion_id);

      if (reservaError) {
        console.error('Error al actualizar la reservación:', reservaError);
        return res.status(200).end(); // Internal Server Error
      }
      
      console.log(`Reservación ${pagoByRequestId.reservacion_id} actualizada a estado: Confirmada`);
    }

    // Responder con éxito (PlaceToPay espera un código 2xx)
    return res.status(200).end();
  } catch (error) {
    console.error('Error en el webhook:', error);
    // Siempre devolver 200 para que PlaceToPay considere entregada la notificación
    return res.status(200).end(); 
  }
}