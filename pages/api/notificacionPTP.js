// pages/api/notificacionPTP.js
import { supabase } from '../../lib/supabase';
import crypto from 'crypto';

export default async function handler(req, res) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    console.log('Método no permitido:', req.method);
    return res.status(405).end();
  }

  try {
    console.log('Recibida notificación de PlaceToPay:', JSON.stringify(req.body, null, 2));
    const data = req.body;
    const { requestId, reference, signature, status } = data;

    // Verificar datos necesarios
    if (!requestId || !status || !status.status) {
      console.error('Datos incompletos en la notificación');
      return res.status(400).end();
    }

    console.log(`Notificación: requestId=${requestId}, referencia=${reference || 'No proporcionada'}, estado=${status.status}`);

    // Verificar firma si está presente
    if (signature && status.date) {
      const secretKey = process.env.PLACE_TO_PAY_KEY;
      if (!secretKey) {
        console.error('PLACE_TO_PAY_KEY no configurada');
        return res.status(500).end();
      }

      const calculatedSignature = crypto
        .createHash('sha1')
        .update(requestId + status.status + status.date + secretKey)
        .digest('hex');

      if (calculatedSignature !== signature) {
        console.error('Firma inválida. Recibida:', signature);
        console.error('Calculada:', calculatedSignature);
        return res.status(401).end();
      }

      console.log('Firma verificada correctamente');
    } else {
      console.log('Notificación sin firma o sin fecha');
    }

    // IMPORTANTE: Convertir requestId a string para asegurar consistencia
    const requestIdStr = String(requestId);

    // Estrategia 1: Buscar pago directamente por place_to_pay_id
    console.log(`Buscando pago con place_to_pay_id=${requestIdStr}`);
    let { data: pago, error: pagoError } = await supabase
      .from('pagos')
      .select('*')
      .eq('place_to_pay_id', requestIdStr)
      .maybeSingle();

    // Logging detallado para depuración
    if (pagoError) {
      console.error('Error al buscar pago por place_to_pay_id:', pagoError);
    } else if (pago) {
      console.log(`Pago encontrado por place_to_pay_id: ${pago.id}`);
    } else {
      console.log('No se encontró pago por place_to_pay_id');
    }

    if (!pago && reference) {
      // Estrategia 2: Buscar primero la reservación por reference_code, luego el pago relacionado
      console.log(`Buscando reservación con reference_code exacto: "${reference}"`);
      
      // IMPORTANTE: Loguear todas las reservaciones para debugging
      const { data: allReservaciones } = await supabase
        .from('reservaciones')
        .select('id, reference_code')
        .limit(10);
        
      console.log('Primeras 10 reservaciones en la BD:', 
        allReservaciones ? allReservaciones.map(r => `${r.id}: ${r.reference_code}`).join(', ') : 'ninguna');
      
      // Primero, buscar la reservación exacta
      const { data: reservacion, error: reservacionError } = await supabase
        .from('reservaciones')
        .select('*')
        .eq('reference_code', reference)
        .maybeSingle();
        
      if (reservacionError) {
        console.error('Error al buscar reservación:', reservacionError);
      }
        
      if (reservacion) {
        console.log(`Reservación encontrada con reference exacto: ${reservacion.id}, ${reservacion.reference_code}`);
        
        // Buscar pago por reservacion_id
        const { data: pagoPorReservacion, error: pagoPorReservacionError } = await supabase
          .from('pagos')
          .select('*')
          .eq('reservacion_id', reservacion.id)
          .maybeSingle();
          
        if (pagoPorReservacionError) {
          console.error('Error al buscar pago por reservacion_id:', pagoPorReservacionError);
        } else if (pagoPorReservacion) {
          console.log(`Pago encontrado por reservacion_id: ${pagoPorReservacion.id}`);
          pago = pagoPorReservacion;
          
          // Actualizar place_to_pay_id si no lo tiene o si es diferente
          if (!pago.place_to_pay_id || pago.place_to_pay_id !== requestIdStr) {
            console.log(`Actualizando place_to_pay_id a ${requestIdStr}`);
            const { error: updateError } = await supabase
              .from('pagos')
              .update({ 
                place_to_pay_id: requestIdStr,
                updated_at: new Date().toISOString()
              })
              .eq('id', pago.id);
            
            if (updateError) {
              console.error('Error actualizando place_to_pay_id:', updateError);
            } else {
              pago.place_to_pay_id = requestIdStr;
            }
          }
        } else {
          // Crear nuevo pago para esta reservación
          console.log(`No se encontró pago existente. Creando nuevo pago para reservación ${reservacion.id}`);
          
          // Determinar estado según la notificación
          let estadoPago = 'Pendiente';
          switch (status.status) {
            case 'APPROVED':
            case 'APPROVED_PARTIAL':
              estadoPago = 'Aprobado';
              break;
            case 'REJECTED':
            case 'REJECTED_PARTIAL':
              estadoPago = 'Rechazado';
              break;
          }
          
          // Obtener detalles de la reservación para calcular el monto
          const { data: detalles } = await supabase
            .from('detalles_reservacion')
            .select('precio')
            .eq('reservacion_id', reservacion.id);
          
          const montoTotal = detalles ? detalles.reduce((sum, detalle) => sum + (detalle.precio || 0), 0) : 0;
          
          // Crear nuevo pago vinculado a la reservación
          const { data: nuevoPago, error: nuevoPagoError } = await supabase
            .from('pagos')
            .insert([{
              reservacion_id: reservacion.id,
              place_to_pay_id: requestIdStr,
              monto: montoTotal,
              estado: estadoPago,
              datos_pago: data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select()
            .single();
          
          if (nuevoPagoError) {
            console.error('Error al crear pago:', nuevoPagoError);
            return res.status(500).end();
          }
          
          pago = nuevoPago;
          console.log('Nuevo pago creado:', pago.id);
        }
      } else {
        // Si la búsqueda exacta falla, probar con variantes
        console.log('No se encontró con reference_code exacto, probando variantes...');
        
        // Prueba 1: Buscar sin espacios
        const trimmedRef = reference.trim();
        console.log(`Buscando por referencia sin espacios: "${trimmedRef}"`);
        
        const { data: trimmedReservacion } = await supabase
          .from('reservaciones')
          .select('*')
          .eq('reference_code', trimmedRef)
          .maybeSingle();
          
        if (trimmedReservacion) {
          console.log(`Reservación encontrada con referencia sin espacios: ${trimmedReservacion.id}`);
          
          // Resto del código para buscar o crear pago asociado a esta reservación
          // (similar al bloque anterior)
          const { data: pagoPorReservacion } = await supabase
            .from('pagos')
            .select('*')
            .eq('reservacion_id', trimmedReservacion.id)
            .maybeSingle();
            
          if (pagoPorReservacion) {
            pago = pagoPorReservacion;
            // Actualizar place_to_pay_id si es necesario (código similar al anterior)
          } else {
            // Crear nuevo pago (código similar al anterior)
          }
        } else {
          // Prueba 2: Búsqueda por ILIKE (insensible a mayúsculas/minúsculas)
          console.log('Buscando por ILIKE...');
          
          const { data: ilikeReservaciones } = await supabase
            .from('reservaciones')
            .select('*')
            .ilike('reference_code', reference)
            .limit(1);
            
          if (ilikeReservaciones && ilikeReservaciones.length > 0) {
            console.log(`Reservación encontrada con ILIKE: ${ilikeReservaciones[0].id}`);
            
            // Resto del código para buscar o crear pago asociado a esta reservación
            // (similar al bloque anterior)
          } else {
            // Prueba 3: Búsqueda por coincidencia parcial como último recurso
            console.log('Buscando por coincidencia parcial...');
            
            const cleanRef = reference.replace(/\s/g, '');
            const { data: partialReservaciones } = await supabase
              .from('reservaciones')
              .select('*')
              .ilike('reference_code', `%${cleanRef}%`)
              .limit(1);
              
            if (partialReservaciones && partialReservaciones.length > 0) {
              console.log(`Reservación encontrada por coincidencia parcial: ${partialReservaciones[0].id}`);
              
              // Resto del código para buscar o crear pago asociado a esta reservación
              // (similar al bloque anterior)
            } else {
              console.log('No se encontró ninguna reservación que coincida con la referencia');
            }
          }
        }
      }
    }

    if (!pago) {
      console.error('No se pudo encontrar ni crear un pago');
      // Registrar la notificación en un log
      console.log('Registrando notificación no procesada en log...');
      // Responder OK para que PlaceToPay no reintente
      return res.status(200).end();
    }

    console.log(`Pago encontrado: ID=${pago.id}, estado actual=${pago.estado}`);

    // Actualizar el estado del pago según la notificación
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

    // Si ya está en el estado correcto, no actualizar
    if (pago.estado !== nuevoEstado) {
      console.log(`Actualizando pago a estado: ${nuevoEstado}`);
      try {
        const { error: updateError } = await supabase
          .from('pagos')
          .update({
            estado: nuevoEstado,
            datos_pago: data,
            updated_at: new Date().toISOString()
          })
          .eq('id', pago.id);

        if (updateError) {
          console.error('Error actualizando pago:', updateError);
          return res.status(500).end();
        }
      } catch (updateError) {
        console.error('Error al intentar actualizar pago:', updateError);
        return res.status(500).end();
      }
    } else {
      console.log(`El pago ya está en estado ${nuevoEstado}, no es necesario actualizar`);
    }

    // Si el pago está aprobado, actualizar la reservación a Confirmada
    if ((status.status === 'APPROVED' || status.status === 'APPROVED_PARTIAL') && nuevoEstado === 'Aprobado') {
      console.log(`Actualizando reservación ${pago.reservacion_id} a Confirmada`);
      try {
        // Verificar el estado actual de la reservación
        const { data: reservacionActual } = await supabase
          .from('reservaciones')
          .select('estado')
          .eq('id', pago.reservacion_id)
          .single();

        // Solo actualizar si no está ya confirmada
        if (reservacionActual && reservacionActual.estado !== 'Confirmada') {
          const { error: reservaError } = await supabase
            .from('reservaciones')
            .update({
              estado: 'Confirmada',
              updated_at: new Date().toISOString()
            })
            .eq('id', pago.reservacion_id);

          if (reservaError) {
            console.error('Error actualizando reservación:', reservaError);
          } else {
            console.log('Reservación actualizada correctamente a Confirmada');
          }
        } else {
          console.log('La reservación ya está en estado Confirmada');
        }
      } catch (error) {
        console.error('Error al intentar actualizar reservación:', error);
      }
    }

    // Respuesta exitosa a PlaceToPay
    console.log('Procesamiento de notificación completado');
    return res.status(200).end();
  } catch (error) {
    console.error('Error en webhook:', error);
    return res.status(200).end(); // Devolver 200 aunque haya error para que PlaceToPay no reintente
  }
}