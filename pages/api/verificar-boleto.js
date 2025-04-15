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

    console.log(`Verificando boleto con código original: ${codigo}`);
    
    // Normalizar el código para manejar los caracteres especiales del escáner Symbol LI2208
    // Eliminar apóstrofes, comillas y otros caracteres no deseados
    const codigoNormalizado = codigo.replace(/['"`\s]/g, '');
    
    // Si el código normalizado incluye 'BC' y existe un guión, podría ser un código de barras.
    // Manejamos formatos como "BC'RES''M9HWKBXE" -> "BCRESM9HWKBXE"
    let codigoLimpio = codigoNormalizado;
    if (codigoNormalizado.includes('BC') && codigoNormalizado.includes('RES')) {
      // Eliminar guiones adicionales que podrían haberse introducido
      codigoLimpio = codigoNormalizado.replace(/-/g, '');
    }
    
    console.log(`Código normalizado para búsqueda: ${codigoLimpio}`);
    
    // Intentar todas las variantes posibles del código
    const variantesCodigo = [
      codigo,                                // Código original tal como viene
      codigoNormalizado,                     // Código sin apóstrofes ni espacios
      codigoLimpio,                          // Código totalmente limpio
      `BC-${codigoLimpio.split('BC')[1]}`,   // Reconstruir formato BC-XXXX
      codigoLimpio.replace('BCRES', 'BC-RES--') // Reconstruir formato original
    ];
    
    // Buscar la reservación con cualquiera de las variantes
    let reservacionData = null;
    let fueCodigoDeBarras = false;

    // 1. Primero buscar por reference_code (código QR)
    for (const varianteCodigo of variantesCodigo) {
      if (reservacionData) break;
      
      const { data, error } = await supabase
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
        .eq('reference_code', varianteCodigo)
        .maybeSingle();

      if (!error && data) {
        console.log(`Encontrado por reference_code: ${varianteCodigo}`);
        reservacionData = data;
      }
    }

    // 2. Si no se encontró por reference_code, buscar por código de barras
    if (!reservacionData) {
      for (const varianteCodigo of variantesCodigo) {
        if (reservacionData) break;
        
        console.log(`Buscando por código de barras: ${varianteCodigo}`);
        
        const { data, error } = await supabase
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
          .or(`codigo_barras.eq.${varianteCodigo},codigo_barras.ilike.%${varianteCodigo.replace(/^BC/i, '')}%`)
          .maybeSingle();
          
        if (!error && data && data.reservaciones) {
          console.log(`Encontrado por código de barras: ${varianteCodigo}`);
          reservacionData = data.reservaciones;
          fueCodigoDeBarras = true;
        }
      }
    }

    // 3. Si todavía no se encontró, intentar una búsqueda parcial en el código de barras
    if (!reservacionData && codigoLimpio.length > 5) {
      // Tomar la parte significativa del código y buscar coincidencias parciales
      const parteClave = codigoLimpio.substring(2); // Eliminar 'BC' si existe
      
      console.log(`Intentando búsqueda parcial con: ${parteClave}`);
      
      const { data, error } = await supabase
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
        .ilike('codigo_barras', `%${parteClave}%`);
        
      if (!error && data && data.length > 0 && data[0].reservaciones) {
        console.log(`Encontrado por búsqueda parcial: ${data[0].codigo_barras}`);
        reservacionData = data[0].reservaciones;
        fueCodigoDeBarras = true;
      }
    }

    // Verificar si se encontró la reservación
    if (!reservacionData) {
      console.log(`No se encontró boleto con ninguna variante del código: ${codigo}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Boleto no encontrado'
      });
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
          tipo_codigo: fueCodigoDeBarras ? 'BARCODE' : 'QR',
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