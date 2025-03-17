// pages/api/payment-status.js
import { getPaymentStatus } from '../../lib/placeToPay';
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { requestId, reservacionId } = req.body;
    
    if (!requestId || !reservacionId) {
      return res.status(400).json({ 
        message: 'Datos incompletos. Se requiere requestId y reservacionId.' 
      });
    }

    console.log(`Procesando verificación de pago para reservación: ${reservacionId}, requestId: ${requestId}`);

    // Verificar que la reservación existe
    const { data: reservacion, error: reservacionError } = await supabase
      .from('reservaciones')
      .select('*')
      .eq('id', reservacionId)
      .single();

    if (reservacionError) {
      console.error('Error obteniendo reservación:', reservacionError);
      return res.status(404).json({ message: 'Reservación no encontrada' });
    }

    console.log(`Reservación encontrada: ${reservacion.reference_code}, estado actual: ${reservacion.estado}`);

    // Obtener el pago asociado
    const { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('*')
      .eq('reservacion_id', reservacionId)
      .single();

    if (pagoError) {
      console.error('Error obteniendo pago:', pagoError);
      return res.status(404).json({ message: 'Pago no encontrado' });
    }

    console.log(`Pago encontrado, id: ${pago.id}, estado actual: ${pago.estado}`);

    // Si el pago no tiene place_to_pay_id, actualizarlo
    if (!pago.place_to_pay_id) {
      console.log(`Actualizando place_to_pay_id a ${requestId} para el pago ${pago.id}`);
      const { error: updateIdError } = await supabase
        .from('pagos')
        .update({ place_to_pay_id: requestId })
        .eq('id', pago.id);
        
      if (updateIdError) {
        console.error('Error actualizando place_to_pay_id:', updateIdError);
      } else {
        pago.place_to_pay_id = requestId;
      }
    } else if (pago.place_to_pay_id !== requestId) {
      console.log(`Advertencia: El requestId proporcionado (${requestId}) difiere del almacenado (${pago.place_to_pay_id})`);
      // Seguimos usando el requestId proporcionado para la consulta a PlaceToPay
    }

    // Consultar el estado del pago en PlaceToPay
    console.log(`Consultando estado en PlaceToPay para requestId: ${requestId}`);
    
    try {
      const response = await getPaymentStatus(requestId);
      console.log('Respuesta de PlaceToPay:', JSON.stringify(response, null, 2));
      
      // Determinación mejorada del estado
      let paymentStatus = 'PENDING'; // Estado por defecto
      let statusMessage = '';
      
      // 1. Revisar en la raíz del objeto
      if (response.status && response.status.status) {
        paymentStatus = response.status.status;
        statusMessage = response.status.message || '';
        console.log(`Estado encontrado en response.status: ${paymentStatus}`);
      }
      
      // 2. Revisar en el objeto payment si existe
      if (response.payment) {
        if (Array.isArray(response.payment) && response.payment.length > 0) {
          // Si hay transacciones, revisamos la más reciente
          const latestPayment = response.payment[0];
          if (latestPayment.status && latestPayment.status.status) {
            paymentStatus = latestPayment.status.status;
            statusMessage = latestPayment.status.message || '';
            console.log(`Estado actualizado desde payment[0]: ${paymentStatus}`);
          }
        } else if (response.payment.status && response.payment.status.status) {
          // Si payment no es un array pero tiene un status
          paymentStatus = response.payment.status.status;
          statusMessage = response.payment.status.message || '';
          console.log(`Estado actualizado desde payment: ${paymentStatus}`);
        }
      }
      
      console.log(`Estado final determinado: ${paymentStatus}, mensaje: ${statusMessage}`);
      
      // Mapeo de estado y actualización en la base de datos
      let dbStatus;
      let reservacionStatus;
      
      switch (paymentStatus) {
        case 'APPROVED':
        case 'APPROVED_PARTIAL': // Añadido para manejar pagos parciales aprobados
          dbStatus = 'Aprobado';
          reservacionStatus = 'Confirmada';
          break;
        case 'REJECTED':
        case 'REJECTED_PARTIAL': // Añadido para manejar pagos parciales rechazados
          dbStatus = 'Rechazado';
          reservacionStatus = 'Cancelada';
          break;
        case 'PENDING_VALIDATION':
        case 'PENDING':
        default:
          dbStatus = 'Pendiente';
          reservacionStatus = 'Pendiente';
      }
      
      console.log(`Actualizando en BD - Estado pago: ${dbStatus}, Estado reservación: ${reservacionStatus}`);
      
      // Actualizar el pago con los nuevos datos
      const { data: updatedPago, error: updatePagoError } = await supabase
        .from('pagos')
        .update({
          estado: dbStatus,
          datos_pago: response,
          updated_at: new Date().toISOString() // Forzar actualización de timestamp
        })
        .eq('id', pago.id)
        .select()
        .single();
      
      if (updatePagoError) {
        console.error('Error actualizando pago:', updatePagoError);
        throw new Error(`Error al actualizar pago: ${updatePagoError.message}`);
      }
      
      console.log(`Pago actualizado correctamente, nuevo estado: ${updatedPago.estado}`);
      
      // Actualizar la reservación si es necesario
      let updatedReservacion = reservacion;
      if (reservacion.estado !== reservacionStatus) {
        const { data: resData, error: resError } = await supabase
          .from('reservaciones')
          .update({ 
            estado: reservacionStatus,
            updated_at: new Date().toISOString() // Forzar actualización de timestamp
          })
          .eq('id', reservacionId)
          .select()
          .single();
        
        if (resError) {
          console.error('Error actualizando reservación:', resError);
          throw new Error(`Error al actualizar reservación: ${resError.message}`);
        }
        
        updatedReservacion = resData;
        console.log(`Reservación actualizada correctamente, nuevo estado: ${updatedReservacion.estado}`);
      } else {
        console.log(`No es necesario actualizar el estado de la reservación, se mantiene como: ${reservacion.estado}`);
      }
      
      // Devolver respuesta con toda la información
      return res.status(200).json({
        success: true,
        paymentStatus: {
          status: {
            status: paymentStatus,
            message: statusMessage
          }
        },
        pago: updatedPago,
        reservacion: updatedReservacion
      });
    } catch (ptpError) {
      console.error('Error al consultar PlaceToPay:', ptpError);
      
      // Si falla la consulta a PlaceToPay, intentamos usar los datos que ya tenemos
      if (pago.datos_pago && pago.datos_pago.status) {
        console.log('Usando datos de pago almacenados:', pago.datos_pago);
        
        return res.status(200).json({
          success: true,
          paymentStatus: {
            status: pago.datos_pago.status
          },
          pago: pago,
          reservacion: reservacion,
          fromCache: true
        });
      }
      
      throw ptpError;
    }
  } catch (error) {
    console.error('Error al verificar estado de pago:', error);
    return res.status(500).json({ 
      message: 'Error al verificar el estado del pago',
      error: error.message
    });
  }
}