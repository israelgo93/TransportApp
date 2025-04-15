// pages/api/registro-verificaciones.js
import { supabase } from '../../lib/supabase';

/**
 * Endpoint API para obtener el historial de verificaciones
 * Útil para reportes y monitoreo de validaciones
 */
export default async function handler(req, res) {
  // Sólo permitir GET para consultar y POST para filtrar
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Método no permitido'
    });
  }

  try {
    // Extraer parámetros de consulta (rango de fechas, límite)
    const { fechaInicio, fechaFin, limite = 100 } = req.method === 'POST' ? req.body : req.query;
    
    // Construir consulta base
    let query = supabase
      .from('historial_validaciones')
      .select(`
        id,
        fecha_validacion,
        tipo_codigo,
        codigo,
        created_at,
        reservaciones:reservacion_id (
          id,
          reference_code,
          fecha_viaje,
          usuario_id,
          horarios:horario_id (
            id,
            hora_salida,
            rutas:ruta_id (
              origen,
              destino
            ),
            buses:bus_id (
              numero
            )
          )
        )
      `)
      .order('fecha_validacion', { ascending: false });
    
    // Añadir filtros si se proporcionan
    if (fechaInicio) {
      query = query.gte('fecha_validacion', fechaInicio);
    }
    
    if (fechaFin) {
      query = query.lte('fecha_validacion', fechaFin);
    }
    
    // Aplicar límite
    query = query.limit(limite);
    
    // Ejecutar consulta
    const { data, error } = await query;
    
    if (error) {
      console.error('Error al obtener historial de verificaciones:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error al obtener historial de verificaciones'
      });
    }
    
    // Formatear datos para la respuesta
    const registrosFormateados = data.map(registro => ({
      id: registro.id,
      fecha: registro.fecha_validacion,
      tipo: registro.tipo_codigo,
      codigo: registro.codigo,
      referencia: registro.reservaciones?.reference_code || 'N/A',
      ruta: registro.reservaciones?.horarios?.rutas 
        ? `${registro.reservaciones.horarios.rutas.origen} → ${registro.reservaciones.horarios.rutas.destino}`
        : 'N/A',
      fechaViaje: registro.reservaciones?.fecha_viaje || 'N/A',
      horaSalida: registro.reservaciones?.horarios?.hora_salida?.substring(0, 5) || 'N/A',
      bus: registro.reservaciones?.horarios?.buses?.numero || 'N/A'
    }));
    
    // Devolver respuesta exitosa
    return res.status(200).json({ 
      success: true, 
      registros: registrosFormateados,
      total: registrosFormateados.length
    });
  } catch (error) {
    console.error('Error al procesar solicitud de historial:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al procesar solicitud de historial'
    });
  }
}