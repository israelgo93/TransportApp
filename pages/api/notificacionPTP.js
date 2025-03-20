/// pages/api/notificacionPTP.js
import { supabase } from '../../lib/supabase';
import crypto from 'crypto';

// Cache para evitar procesar notificaciones duplicadas
const notificationCache = new Map();
const CACHE_TTL = 60000; // 60 segundos

// Estado de sincronización para evitar operaciones concurrentes
const syncState = new Map();

export default async function handler(req, res) {
  // 1. Validación inicial
  if (req.method !== 'POST') {
    console.log('Método no permitido:', req.method);
    return res.status(405).end();
  }

  try {
    const logRequestId = Date.now().toString().slice(-6);
    console.log(`[${logRequestId}] Recibida notificación de PlaceToPay`);
    
    // 2. Extraer y validar datos
    const data = req.body;
    const { requestId, reference, signature, status } = data;

    if (!requestId || !status || !status.status) {
      console.error(`[${logRequestId}] Datos incompletos en la notificación`);
      return res.status(400).end();
    }

    // Convertir requestId a string por consistencia
    const requestIdStr = String(requestId);
    console.log(`[${logRequestId}] Notificación: requestId=${requestIdStr}, estado=${status.status}`);
    
    // 3. Verificar si esta notificación ya fue procesada recientemente
    const cacheKey = `${requestIdStr}-${status.status}`;
    if (notificationCache.has(cacheKey)) {
      console.log(`[${logRequestId}] Notificación duplicada detectada, ignorando`);
      return res.status(200).end(); // Responder OK pero no procesar
    }
    
    // 4. Verificar estado de sincronización
    const syncKey = requestIdStr;
    if (syncState.get(syncKey)) {
      console.log(`[${logRequestId}] Operación en curso para requestId=${requestIdStr}, esperando...`);
      
      // Esperar hasta que la operación en curso termine (máximo 5 segundos)
      let attempts = 0;
      while (syncState.get(syncKey) && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }
      
      // Si aún está en proceso después de esperar, responder OK
      if (syncState.get(syncKey)) {
        console.log(`[${logRequestId}] Tiempo de espera agotado, respondiendo OK`);
        return res.status(200).end();
      }
    }
    
    // Marcar como en proceso
    syncState.set(syncKey, true);

    // 5. Verificar firma si está presente
    try {
      if (signature && status.date) {
        const secretKey = process.env.PLACE_TO_PAY_KEY;
        if (!secretKey) {
          console.error(`[${logRequestId}] PLACE_TO_PAY_KEY no configurada`);
          syncState.delete(syncKey);
          return res.status(500).end();
        }

        const calculatedSignature = crypto
          .createHash('sha1')
          .update(requestId + status.status + status.date + secretKey)
          .digest('hex');

        if (calculatedSignature !== signature) {
          console.error(`[${logRequestId}] Firma inválida. Recibida: ${signature.substring(0, 10)}...`);
          console.error(`[${logRequestId}] Calculada: ${calculatedSignature.substring(0, 10)}...`);
          syncState.delete(syncKey);
          return res.status(401).end();
        }

        console.log(`[${logRequestId}] Firma verificada correctamente`);
      } else {
        console.log(`[${logRequestId}] Notificación sin firma o sin fecha`);
      }
    } catch (verifyError) {
      console.error(`[${logRequestId}] Error al verificar firma:`, verifyError);
      // Continuamos a pesar del error para procesar la notificación
    }

    // 6. ESTRATEGIA PRINCIPAL: Buscar pago directamente por place_to_pay_id
    console.log(`[${logRequestId}] Buscando pago con place_to_pay_id=${requestIdStr}`);
    
    let pago = null;
    let reservacion = null;
    
    try {
      // Buscar pago por place_to_pay_id
      const { data: pagoData, error: pagoError } = await supabase
        .from('pagos')
        .select('*, reservaciones:reservacion_id(*)')
        .eq('place_to_pay_id', requestIdStr)
        .maybeSingle();

      if (pagoError) {
        console.error(`[${logRequestId}] Error al buscar pago:`, pagoError);
      } else if (pagoData) {
        console.log(`[${logRequestId}] Pago encontrado: ${pagoData.id}, reservación: ${pagoData.reservacion_id}`);
        pago = pagoData;
        reservacion = pagoData.reservaciones;
      } else {
        console.log(`[${logRequestId}] No se encontró pago por place_to_pay_id`);
      }
    } catch (searchError) {
      console.error(`[${logRequestId}] Error al buscar pago:`, searchError);
    }

    // 7. ESTRATEGIA ALTERNATIVA: Buscar por referencia si no se encontró por place_to_pay_id
    if (!pago && reference) {
      try {
        console.log(`[${logRequestId}] Buscando reservación por reference_code: ${reference}`);
        
        // Buscar la reservación por reference_code
        const { data: resData, error: resError } = await supabase
          .from('reservaciones')
          .select('*')
          .eq('reference_code', reference)
          .maybeSingle();
          
        if (resError) {
          console.error(`[${logRequestId}] Error al buscar reservación:`, resError);
        } else if (resData) {
          console.log(`[${logRequestId}] Reservación encontrada: ${resData.id}`);
          reservacion = resData;
          
          // Buscar el pago asociado a la reservación
          const { data: pagoPorRes, error: pagoPorResError } = await supabase
            .from('pagos')
            .select('*')
            .eq('reservacion_id', reservacion.id)
            .maybeSingle();
            
          if (pagoPorResError) {
            console.error(`[${logRequestId}] Error al buscar pago por reservacion_id:`, pagoPorResError);
          } else if (pagoPorRes) {
            console.log(`[${logRequestId}] Pago encontrado por reservacion_id: ${pagoPorRes.id}`);
            pago = pagoPorRes;
            
            // Actualizar place_to_pay_id si es necesario
            if (!pago.place_to_pay_id || pago.place_to_pay_id !== requestIdStr) {
              const { error: updateIdError } = await supabase
                .from('pagos')
                .update({ 
                  place_to_pay_id: requestIdStr,
                  updated_at: new Date().toISOString() 
                })
                .eq('id', pago.id);
              
              if (updateIdError) {
                console.error(`[${logRequestId}] Error actualizando place_to_pay_id:`, updateIdError);
              } else {
                console.log(`[${logRequestId}] place_to_pay_id actualizado a: ${requestIdStr}`);
                pago.place_to_pay_id = requestIdStr;
              }
            }
          } else {
            console.log(`[${logRequestId}] No se encontró pago para reservación ${reservacion.id}`);
            
            // Crear nuevo pago si no existe
            console.log(`[${logRequestId}] Creando nuevo pago para reservación`);
            
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
            
            // Obtener detalles para calcular monto
            const { data: detalles } = await supabase
              .from('detalles_reservacion')
              .select('precio')
              .eq('reservacion_id', reservacion.id);
            
            const montoTotal = detalles ? detalles.reduce((sum, detalle) => sum + (detalle.precio || 0), 0) : 0;
            
            // Crear pago
            const { data: nuevoPago, error: nuevoPagoError } = await supabase
              .from('pagos')
              .insert({
                reservacion_id: reservacion.id,
                place_to_pay_id: requestIdStr,
                monto: montoTotal,
                estado: estadoPago,
                datos_pago: data,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select()
              .single();
            
            if (nuevoPagoError) {
              console.error(`[${logRequestId}] Error al crear pago:`, nuevoPagoError);
            } else {
              console.log(`[${logRequestId}] Nuevo pago creado: ${nuevoPago.id}`);
              pago = nuevoPago;
            }
          }
        } else {
          console.log(`[${logRequestId}] No se encontró reservación con referencia: ${reference}`);
          
          // Registrar notificación no procesada
          console.log(`[${logRequestId}] Registrando notificación no procesada en log`);
          
          // Crear tabla/registro para notificaciones sin procesar
          try {
            await supabase
              .from('payment_notifications_log')
              .insert({
                request_id: requestIdStr,
                reference: reference || null,
                status: status.status,
                raw_data: data,
                processed: false,
                created_at: new Date().toISOString()
              });
          } catch (logError) {
            console.error(`[${logRequestId}] Error al registrar notificación:`, logError);
          }
        }
      } catch (alternativeError) {
        console.error(`[${logRequestId}] Error en búsqueda alternativa:`, alternativeError);
      }
    }

    // 8. Si no se pudo encontrar ni crear un pago, registrar y finalizar
    if (!pago) {
      console.error(`[${logRequestId}] No se pudo encontrar ni crear un pago`);
      
      // Registrar en log especial
      try {
        await supabase
          .from('payment_notifications_log')
          .insert({
            request_id: requestIdStr,
            reference: reference || null,
            status: status.status,
            raw_data: data,
            processed: false,
            error: 'No se encontró pago asociado',
            created_at: new Date().toISOString()
          });
      } catch (logError) {
        console.error(`[${logRequestId}] Error al registrar notificación:`, logError);
      }
      
      // Eliminar estado de sincronización
      syncState.delete(syncKey);
      
      // Responder OK para que PlaceToPay no reintente
      return res.status(200).end();
    }

    // 9. Actualizar el estado del pago según la notificación
    console.log(`[${logRequestId}] Pago encontrado: ID=${pago.id}, estado actual=${pago.estado}`);
    
    let nuevoEstado;
    let reservacionEstado;
    
    switch (status.status) {
      case 'APPROVED':
      case 'APPROVED_PARTIAL':
        nuevoEstado = 'Aprobado';
        reservacionEstado = 'Confirmada';
        break;
      case 'REJECTED':
      case 'REJECTED_PARTIAL':
        nuevoEstado = 'Rechazado';
        reservacionEstado = 'Cancelada';
        break;
      default:
        nuevoEstado = 'Pendiente';
        reservacionEstado = reservacion ? reservacion.estado : 'Pendiente';
    }

    // Si ya está en el estado correcto, no actualizar
    if (pago.estado === nuevoEstado) {
      console.log(`[${logRequestId}] El pago ya está en estado ${nuevoEstado}, no es necesario actualizar`);
    } else {
      console.log(`[${logRequestId}] Actualizando pago a estado: ${nuevoEstado}`);
      
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
          console.error(`[${logRequestId}] Error actualizando pago:`, updateError);
        }
      } catch (updateError) {
        console.error(`[${logRequestId}] Error al intentar actualizar pago:`, updateError);
      }
    }

    // 10. Actualizar la reservación si es necesario
    if (reservacion && 
        (status.status === 'APPROVED' || status.status === 'APPROVED_PARTIAL') && 
        nuevoEstado === 'Aprobado' && 
        reservacion.estado !== 'Confirmada') {
      
      console.log(`[${logRequestId}] Actualizando reservación ${reservacion.id} a Confirmada`);
      
      try {
        const { error: reservaError } = await supabase
          .from('reservaciones')
          .update({
            estado: 'Confirmada',
            updated_at: new Date().toISOString()
          })
          .eq('id', reservacion.id);

        if (reservaError) {
          console.error(`[${logRequestId}] Error actualizando reservación:`, reservaError);
        } else {
          console.log(`[${logRequestId}] Reservación actualizada correctamente a Confirmada`);
        }
      } catch (error) {
        console.error(`[${logRequestId}] Error al intentar actualizar reservación:`, error);
      }
    }

    // 11. Registrar notificación como procesada
    try {
      await supabase
        .from('payment_notifications_log')
        .insert({
          request_id: requestIdStr,
          reference: reference || null,
          status: status.status,
          raw_data: data,
          processed: true,
          pago_id: pago.id,
          reservacion_id: reservacion ? reservacion.id : null,
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      console.error(`[${logRequestId}] Error al registrar notificación procesada:`, logError);
    }
    
    // Guardar en caché para evitar procesar duplicados
    notificationCache.set(cacheKey, {
      timestamp: Date.now(),
      requestId: requestIdStr
    });

    // Eliminar estado de sincronización
    syncState.delete(syncKey);

    // Respuesta exitosa a PlaceToPay
    console.log(`[${logRequestId}] Procesamiento de notificación completado`);
    return res.status(200).end();
  } catch (error) {
    console.error('Error en webhook:', error);
    
    // Liberar estado de sincronización en caso de error
    if (req.body && req.body.requestId) {
      syncState.delete(String(req.body.requestId));
    }
    
    // Devolver 200 aunque haya error para que PlaceToPay no reintente
    return res.status(200).end();
  }
}

// Limpiar caché antigua cada 10 minutos
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    notificationCache.forEach((value, key) => {
      if (now - value.timestamp > CACHE_TTL) {
        notificationCache.delete(key);
      }
    });
    
    // También limpiar estados de sincronización antiguos
    syncState.forEach((value, key) => {
      if (now - value > 30000) { // 30 segundos máximo
        syncState.delete(key);
      }
    });
  }, 600000); // 10 minutos
}