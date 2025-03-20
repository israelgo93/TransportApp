// pages/api/payment-status.js
import { getPaymentStatus } from '../../lib/placeToPay';
import { supabase } from '../../lib/supabase';

// Cache para evitar verificaciones duplicadas en corto tiempo
const statusCheckCache = new Map();
const CACHE_TTL = 30000; // 30 segundos

export default async function handler(req, res) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      message: 'Method not allowed' 
    });
  }

  try {
    const { requestId, reservacionId } = req.body;
    
    if (!reservacionId) {
      return res.status(400).json({ 
        success: false,
        message: 'Datos incompletos. Se requiere al menos reservacionId.' 
      });
    }

    console.log(`Procesando verificación de pago para reservación: ${reservacionId}`);
    
    // 1. Verificar cache para evitar solicitudes duplicadas
    const cacheKey = `${reservacionId}-${requestId || 'no-req'}`;
    const cachedResult = statusCheckCache.get(cacheKey);
    
    if (cachedResult && (Date.now() - cachedResult.timestamp < CACHE_TTL)) {
      console.log(`Usando resultado en caché para ${cacheKey} (${Date.now() - cachedResult.timestamp}ms)`);
      return res.status(200).json(cachedResult.data);
    }

    // 2. Verificar que la reservación existe - SIN JOIN para minimizar carga
    let reservacion;
    try {
      const { data, error } = await supabase
        .from('reservaciones')
        .select('id, estado, reference_code, usuario_id')
        .eq('id', reservacionId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        console.log(`Reservación no encontrada con id: ${reservacionId}`);
        return res.status(404).json({ 
          success: false,
          message: 'Reservación no encontrada' 
        });
      }
      
      reservacion = data;
      console.log(`Reservación encontrada: ${reservacion.reference_code}, estado: ${reservacion.estado}`);
    } catch (error) {
      console.error('Error obteniendo reservación:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error al obtener la reservación' 
      });
    }

    // 3. Obtener el pago asociado por reservacion_id
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
        console.log(`Pago encontrado, id: ${currentPago.id}, estado actual: ${currentPago.estado}`);
        
        // Si el pago ya está en estado final y tenemos datos completos, no necesitamos consultar a PlaceToPay
        if ((currentPago.estado === 'Aprobado' || currentPago.estado === 'Rechazado') && 
            currentPago.datos_pago && currentPago.datos_pago.status) {
          
          // Crear respuesta para retornar directamente
          const quickResponse = {
            success: true,
            paymentStatus: {
              status: currentPago.datos_pago.status
            },
            pago: currentPago,
            reservacion,
            fromCache: false
          };
          
          // Almacenar en caché
          statusCheckCache.set(cacheKey, {
            timestamp: Date.now(),
            data: quickResponse
          });
          
          console.log(`Retornando datos existentes sin consultar PlaceToPay (estado: ${currentPago.estado})`);
          return res.status(200).json(quickResponse);
        }
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
          return res.status(500).json({ 
            success: false,
            message: 'Error obteniendo detalles de reservación' 
          });
        }
        
        const montoTotal = detalles.reduce((sum, detalle) => sum + (detalle.precio || 0), 0);
        
        const { data: nuevoPago, error: nuevoPagoError } = await supabase
          .from('pagos')
          .insert([{
            reservacion_id: reservacionId,
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
          return res.status(500).json({ 
            success: false,
            message: 'Error al crear registro de pago' 
          });
        }
        
        console.log('Nuevo pago creado con ID:', nuevoPago.id);
        currentPago = nuevoPago;
      }
    } catch (error) {
      console.error('Error al procesar pago:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Error al procesar información de pago' 
      });
    }

    // 4. Determinar el requestId efectivo para consultar a PlaceToPay
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
    
    // 5. Si no tenemos requestId para consultar, verificamos si ya está aprobado en la BD
    if (!effectiveRequestId) {
      console.log('No hay requestId disponible, verificando estado en base de datos');
      
      // Si el pago ya está aprobado, retornar este estado
      if (currentPago.estado === 'Aprobado') {
        console.log('Pago ya está marcado como aprobado en la base de datos');
        
        const approvedResponse = {
          success: true,
          paymentStatus: {
            status: {
              status: 'APPROVED',
              message: 'La transacción ha sido aprobada exitosamente'
            }
          },
          pago: currentPago,
          reservacion
        };
        
        // Almacenar en caché
        statusCheckCache.set(cacheKey, {
          timestamp: Date.now(),
          data: approvedResponse
        });
        
        return res.status(200).json(approvedResponse);
      }
      
      // Si el pago no está aprobado y no tenemos requestId, retornar estado pendiente
      const pendingResponse = {
        success: false,
        paymentStatus: {
          status: {
            status: 'PENDING',
            message: 'No hay información disponible para verificar el estado del pago'
          }
        },
        pago: currentPago,
        reservacion
      };
      
      // Almacenar en caché por un período más corto (10 segundos)
      statusCheckCache.set(cacheKey, {
        timestamp: Date.now(),
        data: pendingResponse,
        shorterTTL: true
      });
      
      return res.status(200).json(pendingResponse);
    }

    // 6. Consultar estado en PlaceToPay
    try {
      console.log(`Consultando estado en PlaceToPay para requestId: ${effectiveRequestId}`);
      const response = await getPaymentStatus(effectiveRequestId);
      
      // Determinación optimizada del estado
      let paymentStatus = 'PENDING'; // Estado por defecto
      let statusMessage = '';
      
      // Extraer estado del objeto de respuesta
      if (response.status && response.status.status) {
        paymentStatus = response.status.status;
        statusMessage = response.status.message || '';
      } else if (response.payment) {
        if (Array.isArray(response.payment) && response.payment.length > 0) {
          const latestPayment = response.payment[0];
          if (latestPayment.status && latestPayment.status.status) {
            paymentStatus = latestPayment.status.status;
            statusMessage = latestPayment.status.message || '';
          }
        } else if (response.payment.status && response.payment.status.status) {
          paymentStatus = response.payment.status.status;
          statusMessage = response.payment.status.message || '';
        }
      }
      
      console.log(`Estado determinado: ${paymentStatus}, mensaje: ${statusMessage}`);
      
      // 7. Mapeo de estado y actualización en la base de datos
      let dbStatus;
      let reservacionStatus;
      
      switch (paymentStatus) {
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
        default:
          dbStatus = 'Pendiente';
          reservacionStatus = 'Pendiente';
      }
      
      // Optimización: Actualizar solo si es necesario
      const needsUpdate = currentPago.estado !== dbStatus;
      console.log(`¿Necesita actualización? ${needsUpdate ? 'Sí' : 'No'} (${currentPago.estado} -> ${dbStatus})`);
      
      // 8. Si no teníamos place_to_pay_id guardado, actualizarlo ahora
      if (!currentPago.place_to_pay_id && effectiveRequestId) {
        console.log(`Actualizando place_to_pay_id a ${effectiveRequestId}`);
        
        try {
          const { error } = await supabase
            .from('pagos')
            .update({ 
              place_to_pay_id: String(effectiveRequestId),
              updated_at: new Date().toISOString()
            })
            .eq('id', currentPago.id);
            
          if (error) {
            console.error('Error actualizando place_to_pay_id:', error);
          } else {
            currentPago.place_to_pay_id = String(effectiveRequestId);
          }
        } catch (updateError) {
          console.error('Error en actualización de place_to_pay_id:', updateError);
        }
      }
      
      // 9. Actualizar el pago solo si es necesario
      let updatedPago = currentPago;
      if (needsUpdate) {
        try {
          const { data, error } = await supabase
            .from('pagos')
            .update({
              estado: dbStatus,
              datos_pago: response,
              updated_at: new Date().toISOString()
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
            console.log(`Pago actualizado correctamente a: ${updatedPago.estado}`);
          }
        } catch (updateError) {
          console.error('Error en actualización de pago:', updateError);
        }
      }
      
      // 10. Actualizar la reservación si es necesario (solo si cambió el estado)
      let updatedReservacion = reservacion;
      if (needsUpdate && reservacion.estado !== reservacionStatus) {
        try {
          const { data, error } = await supabase
            .from('reservaciones')
            .update({ 
              estado: reservacionStatus,
              updated_at: new Date().toISOString()
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
            console.log(`Reservación actualizada correctamente a: ${updatedReservacion.estado}`);
          }
        } catch (updateError) {
          console.error('Error en actualización de reservación:', updateError);
        }
      }
      
      // 11. Construir y retornar respuesta
      const finalResponse = {
        success: true,
        paymentStatus: {
          status: {
            status: paymentStatus,
            message: statusMessage
          }
        },
        pago: updatedPago,
        reservacion: updatedReservacion
      };
      
      // Almacenar en caché
      statusCheckCache.set(cacheKey, {
        timestamp: Date.now(),
        data: finalResponse
      });
      
      return res.status(200).json(finalResponse);
    } catch (ptpError) {
      console.error('Error al consultar PlaceToPay:', ptpError);
      
      // Si falla la consulta a PlaceToPay, intentar usar datos existentes
      if (currentPago.datos_pago && currentPago.datos_pago.status) {
        console.log('Usando datos de pago almacenados como fallback');
        
        const fallbackResponse = {
          success: true,
          paymentStatus: {
            status: currentPago.datos_pago.status
          },
          pago: currentPago,
          reservacion,
          fromCache: true
        };
        
        // Almacenar en caché por un período más corto
        statusCheckCache.set(cacheKey, {
          timestamp: Date.now(),
          data: fallbackResponse,
          shorterTTL: true
        });
        
        return res.status(200).json(fallbackResponse);
      }
      
      // Si no tenemos datos, retornar error
      return res.status(500).json({ 
        success: false,
        message: 'Error al consultar estado de pago en PlaceToPay',
        error: ptpError.message
      });
    }
  } catch (error) {
    console.error('Error al verificar estado de pago:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Error al verificar el estado del pago',
      error: error.message
    });
  }
}

// Limpiar caché antigua cada minuto
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    statusCheckCache.forEach((value, key) => {
      const ttl = value.shorterTTL ? CACHE_TTL / 3 : CACHE_TTL;
      if (now - value.timestamp > ttl) {
        statusCheckCache.delete(key);
      }
    });
  }, 60000);
}