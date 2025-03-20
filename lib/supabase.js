// lib/supabase.js - Versión corregida
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno SUPABASE');
}

// Configuraciones adicionales para mejorar la estabilidad
const options = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false // Evita problemas con parámetros de URL
  },
  global: {
    // Asegurar que las solicitudes tengan un timeout
    fetch: (...args) => {
      const [url, options] = args;
      const timeout = 10000; // 10 segundos
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const fetchPromise = fetch(url, {
        ...options,
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));
      
      return fetchPromise;
    }
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, options);