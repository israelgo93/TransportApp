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
    
    if (!reservacionId) {
      return res.status(400).json({ 
        message: 'Datos incompletos. Se requiere al menos reservacionId.' 
      });
    }

    console.log(`Procesando verificación de pago para reservación: ${reservacionId}`);
    if (requestId) {
      console.log(`RequestId proporcionado: ${requestId}`);
    }

    // Verificar que la reservación existe - SIN JOIN
    let reservacion;
    try {
      const { data, error } = await supabase
        .from('reservaciones')
        .select('*')  // Sin hacer join con usuario_id
        .eq('id', reservacionId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        console.log(`Reservación no encontrada con id: ${reservacionId}`);
        return res.status(404).json({ message: 'Reservación no encontrada' });
      }
      
      reservacion = data;
      console.log(`Reservación encontrada: ${reservacion.reference_code}, estado actual: ${reservacion.estado}, usuario_id: ${reservacion.usuario_id}`);
      
      // La verificación de propiedad ya está garantizada por las políticas RLS de Supabase
    } catch (error) {
      console.error('Error obteniendo reservación:', error);
      return res.status(500).json({ message: 'Error al obtener la reservación' });
    }

    // Obtener el pago asociado específicamente por reservacion_id
    let currentPago;
    try {
      const { data, error } = await supabase
        .from('pagos')
        .select('*')
        .eq('reservacion_id', reservacionId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      if (data) {
        currentPago = data;
        console.log(`Pago encontrado, id: ${currentPago.id}, estado actual: ${currentPago.estado}, place_to_pay_id: ${currentPago.place_to_pay_id || 'no asignado'}`);
      } else {
        // Si no existe un pago, lo creamos vinculado a esta reservación
        console.log('No existe pago para esta reservación, creando uno nuevo...');
        
        // Obtener detalles de la reservación para calcular el monto
        const { data: detalles, error: detallesError } = await supabase
          .from('detalles_reservacion')
          .select('precio')
          .eq('reservacion_id', reservacionId);
          
        if (detallesError) {
          console.error('Error obteniendo detalles de reservación:', detallesError);
          return res.status(500).json({ message: 'Error obteniendo detalles de reservación' });
        }
        
        const montoTotal = detalles.reduce((sum, detalle) => sum + (detalle.precio || 0), 0);
        
        const { data: nuevoPago, error: nuevoPagoError } = await supabase
          .from('pagos')
          .insert([{
            reservacion_id: reservacionId,  // Clave foránea a la reservación
            place_to_pay_id: requestId ? String(requestId) : null,
            monto: montoTotal || 0,
            estado: 'Pendiente',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select()
          .single();
          
        if (nuevoPagoError) {
          console.error('Error creando nuevo pago:', nuevoPagoError);
          return res.status(500).json({ message: 'Error al crear registro de pago' });
        }
        
        console.log('Nuevo pago creado con ID:', nuevoPago.id);
        currentPago = nuevoPago;
      }
    } catch (error) {
      console.error('Error al procesar pago:', error);
      return res.status(500).json({ message: 'Error al procesar información de pago' });
    }

    // Obtener el requestId para consultar a PlaceToPay
    let effectiveRequestId = requestId;
    
    // Si no se proporcionó requestId, intentamos obtenerlo del pago
    if (!effectiveRequestId && currentPago.place_to_pay_id) {
      effectiveRequestId = currentPago.place_to_pay_id;
      console.log(`Usando requestId del pago: ${effectiveRequestId}`);
    }
    
    // Si aún no tenemos requestId y tenemos datos_pago, intentamos obtenerlo de ahí
    if (!effectiveRequestId && currentPago.datos_pago && currentPago.datos_pago.requestId) {
      effectiveRequestId = String(currentPago.datos_pago.requestId);
      console.log(`Usando requestId de datos_pago: ${effectiveRequestId}`);
    }
    
    // Si no tenemos requestId para consultar, verificamos si ya está aprobado en la BD
    if (!effectiveRequestId) {
      console.log('No hay requestId disponible, verificando estado en base de datos');
      
      if (currentPago.estado === 'Aprobado') {
        console.log('Pago ya está marcado como aprobado en la base de datos');
        return res.status(200).json({
          success: true,
          paymentStatus: {
            status: {
              status: 'APPROVED',
              message: 'La transacción ha sido aprobada exitosamente'
            }
          },
          pago: currentPago,
          reservacion: reservacion
        });
      }
      
      // Si el pago no está aprobado y no tenemos requestId, devolver información de estado pendiente
      return res.status(200).json({
        success: false,
        paymentStatus: {
          status: {
            status: 'PENDING',
            message: 'No hay información disponible para verificar el estado del pago'
          }
        },
        pago: currentPago,
        reservacion: reservacion
      });
    }

    // Consultar estado en PlaceToPay
    try {
      console.log(`Consultando estado en PlaceToPay para requestId: ${effectiveRequestId}`);
      const response = await getPaymentStatus(effectiveRequestId);
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
      
      // Si no teníamos place_to_pay_id guardado, actualizarlo ahora
      if (!currentPago.place_to_pay_id && effectiveRequestId) {
        console.log(`Actualizando place_to_pay_id a ${effectiveRequestId}`);
        
        try {
          const { data, error } = await supabase
            .from('pagos')
            .update({ place_to_pay_id: String(effectiveRequestId) })
            .eq('id', currentPago.id)
            .select();
            
          if (error) {
            console.error('Error actualizando place_to_pay_id:', error);
          } else {
            console.log('place_to_pay_id actualizado correctamente');
            currentPago.place_to_pay_id = String(effectiveRequestId);
          }
        } catch (updateError) {
          console.error('Error en la actualización de place_to_pay_id:', updateError);
        }
      }
      
      // Actualizar el pago con los nuevos datos
      let updatedPago = currentPago;
      try {
        const { data, error } = await supabase
          .from('pagos')
          .update({
            estado: dbStatus,
            datos_pago: response,
            updated_at: new Date().toISOString() // Forzar actualización de timestamp
          })
          .eq('id', currentPago.id)
          .select()
          .maybeSingle();
        
        if (error) {
          console.error('Error actualizando pago:', error);
          throw new Error(`Error al actualizar pago: ${error.message}`);
        }
        
        if (data) {
          updatedPago = data;
          console.log(`Pago actualizado correctamente, nuevo estado: ${updatedPago.estado}`);
        } else {
          console.log('No se recibieron datos actualizados del pago, usando datos anteriores');
        }
      } catch (updateError) {
        console.error('Error en la actualización del pago:', updateError);
        // Continuamos con el pago actual
      }
      
      // Actualizar la reservación si es necesario
      let updatedReservacion = reservacion;
      if (reservacion.estado !== reservacionStatus) {
        try {
          const { data, error } = await supabase
            .from('reservaciones')
            .update({ 
              estado: reservacionStatus,
              updated_at: new Date().toISOString() // Forzar actualización de timestamp
            })
            .eq('id', reservacionId)
            .select()
            .maybeSingle();
          
          if (error) {
            console.error('Error actualizando reservación:', error);
            throw new Error(`Error al actualizar reservación: ${error.message}`);
          }
          
          if (data) {
            updatedReservacion = data;
            console.log(`Reservación actualizada correctamente, nuevo estado: ${updatedReservacion.estado}`);
          } else {
            console.log('No se recibieron datos actualizados de la reservación, usando datos anteriores');
          }
        } catch (updateError) {
          console.error('Error en la actualización de la reservación:', updateError);
          // Continuamos con la reservación actual
        }
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
      if (currentPago.datos_pago && currentPago.datos_pago.status) {
        console.log('Usando datos de pago almacenados:', currentPago.datos_pago);
        
        return res.status(200).json({
          success: true,
          paymentStatus: {
            status: currentPago.datos_pago.status
          },
          pago: currentPago,
          reservacion: reservacion,
          fromCache: true
        });
      }
      
      return res.status(500).json({ 
        message: 'Error al consultar estado de pago en PlaceToPay',
        error: ptpError.message
      });
    }
  } catch (error) {
    console.error('Error al verificar estado de pago:', error);
    return res.status(500).json({ 
      message: 'Error al verificar el estado del pago',
      error: error.message
    });
  }
}