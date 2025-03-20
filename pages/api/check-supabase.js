// pages/api/check-supabase.js
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  try {
    // Verificar conexión con una consulta simple
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    if (error) {
      console.error('Error en conexión a Supabase:', error);
      return res.status(500).json({
        success: false,
        message: 'Error en conexión a Supabase',
        error: error.message
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Conexión a Supabase establecida correctamente',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error inesperado:', err);
    return res.status(500).json({
      success: false,
      message: 'Error inesperado',
      error: err.message
    });
  }
}