// pages/api/verificar-boleto.js
import { supabase } from '../../lib/supabase';

/**
 * Endpoint API para verificar boletos mediante código
 * Soporta códigos QR y de barras
 */
export default async function handler(req, res) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Método no permitido'
    });
  }

  try {
    // Extraer el código del cuerpo de la solicitud
    const { codigo } = req.body;
    
    if (!codigo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Se requiere un código para verificar'
      });
    }

    console.log(`Verificando boleto con código: ${codigo}`);
    
    // Buscar la reservación por reference_code
    let { data: reservacionData, error: reservacionError } = await supabase
      .from('reservaciones')
      .select(`
        id,
        fecha_viaje,
        estado,
        reference_code,
        created_at,
        boleto_validado,
        fecha_validacion,
        horarios:horario_id (
          id,
          hora_salida,
          precio,
          rutas:ruta_id (
            id,
            origen,
            destino,
            distancia,
            duracion_estimada
          ),
          buses:bus_id (
            id,
            numero,
            tipo
          )
        ),
        detalles_reservacion (
          id,
          asientos:asiento_id (
            id,
            numero,
            tipo
          )
        )
      `)
      .eq('reference_code', codigo)
      .maybeSingle();

    if (reservacionError) {
      console.error('Error al buscar reservación:', reservacionError);
      return res.status(500).json({ 
        success: false, 
        message: 'Error al verificar el boleto'
      });
    }

    // Verificar si se encontró la reservación
    if (!reservacionData) {
      console.log(`No se encontró boleto con código: ${codigo}`);
      
      // Intentar buscar por código de barras si está configurado
      const { data: reservacionBarcode, error: barcodeError } = await supabase
        .from('codigos_barras_boletos')
        .select(`
          id,
          codigo_barras,
          reservacion_id,
          reservaciones:reservacion_id (
            id,
            fecha_viaje,
            estado,
            reference_code,
            created_at,
            boleto_validado,
            fecha_validacion,
            horarios:horario_id (
              id,
              hora_salida,
              precio,
              rutas:ruta_id (
                id,
                origen,
                destino,
                distancia,
                duracion_estimada
              ),
              buses:bus_id (
                id,
                numero,
                tipo
              )
            ),
            detalles_reservacion (
              id,
              asientos:asiento_id (
                id,
                numero,
                tipo
              )
            )
          )
        `)
        .eq('codigo_barras', codigo)
        .maybeSingle();
        
      if (barcodeError || !reservacionBarcode || !reservacionBarcode.reservaciones) {
        return res.status(404).json({ 
          success: false, 
          message: 'Boleto no encontrado'
        });
      }
      
      // Usar la reservación encontrada por código de barras
      reservacionData = reservacionBarcode.reservaciones;
    }
    
    // Verificar el estado de la reservación
    if (reservacionData.estado !== 'Confirmada') {
      return res.status(200).json({ 
        success: true, 
        status: 'INVALID',
        message: 'Boleto no válido o no pagado',
        boleto: null
      });
    }
    
    // Verificar si el boleto ya fue usado
    if (reservacionData.boleto_validado) {
      // Formatear información del boleto para la respuesta
      const asientosNumeros = reservacionData.detalles_reservacion
        ?.map(detalle => detalle.asientos?.numero)
        .filter(Boolean)
        .sort((a, b) => a - b)
        .join(', ');
        
      const boletoInfo = {
        id: reservacionData.id,
        reference_code: reservacionData.reference_code,
        fecha_viaje: reservacionData.fecha_viaje,
        hora_salida: reservacionData.horarios?.hora_salida?.substring(0, 5),
        origen: reservacionData.horarios?.rutas?.origen,
        destino: reservacionData.horarios?.rutas?.destino,
        bus: reservacionData.horarios?.buses?.numero,
        tipo_bus: reservacionData.horarios?.buses?.tipo,
        asientos: asientosNumeros,
        fecha_uso: reservacionData.fecha_validacion
      };
      
      return res.status(200).json({ 
        success: true, 
        status: 'USED',
        message: 'Este boleto ya ha sido utilizado anteriormente',
        boleto: boletoInfo
      });
    }
    
    // Verificar si el boleto está caducado (fecha de viaje anterior a hoy)
    const fechaViaje = new Date(reservacionData.fecha_viaje);
    fechaViaje.setHours(23, 59, 59, 999); // Fin del día
    
    const hoy = new Date();
    
    if (fechaViaje < hoy) {
      // Formatear información del boleto para la respuesta
      const asientosNumeros = reservacionData.detalles_reservacion
        ?.map(detalle => detalle.asientos?.numero)
        .filter(Boolean)
        .sort((a, b) => a - b)
        .join(', ');
        
      const boletoInfo = {
        id: reservacionData.id,
        reference_code: reservacionData.reference_code,
        fecha_viaje: reservacionData.fecha_viaje,
        hora_salida: reservacionData.horarios?.hora_salida?.substring(0, 5),
        origen: reservacionData.horarios?.rutas?.origen,
        destino: reservacionData.horarios?.rutas?.destino,
        bus: reservacionData.horarios?.buses?.numero,
        tipo_bus: reservacionData.horarios?.buses?.tipo,
        asientos: asientosNumeros
      };
      
      return res.status(200).json({ 
        success: true, 
        status: 'EXPIRED',
        message: 'Este boleto ha caducado',
        boleto: boletoInfo
      });
    }
    
    // Si llegamos aquí, el boleto es válido
    // Marcar como usado en la base de datos
    const ahora = new Date().toISOString();
    
    const { error: updateError } = await supabase
      .from('reservaciones')
      .update({ 
        boleto_validado: true,
        fecha_validacion: ahora
      })
      .eq('id', reservacionData.id);
      
    if (updateError) {
      console.error('Error al marcar boleto como usado:', updateError);
      // A pesar del error, seguimos considerando el boleto como válido
    }
    
    // Registrar esta validación en el historial
    try {
      await supabase
        .from('historial_validaciones')
        .insert({
          reservacion_id: reservacionData.id,
          fecha_validacion: ahora,
          tipo_codigo: codigo === reservacionData.reference_code ? 'QR' : 'BARCODE',
          codigo: codigo
        });
    } catch (logError) {
      console.error('Error al registrar en historial:', logError);
      // No es crítico, continuamos con la validación
    }
    
    // Formatear información del boleto para la respuesta
    const asientosNumeros = reservacionData.detalles_reservacion
      ?.map(detalle => detalle.asientos?.numero)
      .filter(Boolean)
      .sort((a, b) => a - b)
      .join(', ');
      
    const boletoInfo = {
      id: reservacionData.id,
      reference_code: reservacionData.reference_code,
      fecha_viaje: reservacionData.fecha_viaje,
      hora_salida: reservacionData.horarios?.hora_salida?.substring(0, 5),
      origen: reservacionData.horarios?.rutas?.origen,
      destino: reservacionData.horarios?.rutas?.destino,
      bus: reservacionData.horarios?.buses?.numero,
      tipo_bus: reservacionData.horarios?.buses?.tipo,
      asientos: asientosNumeros,
      fecha_uso: ahora
    };
    
    // Devolver respuesta exitosa
    return res.status(200).json({ 
      success: true, 
      status: 'VALID',
      message: 'Boleto válido',
      boleto: boletoInfo
    });
  } catch (error) {
    console.error('Error inesperado al verificar boleto:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al procesar la verificación del boleto'
    });
  }
}