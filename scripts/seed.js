///home/phiuser/phi/transporte-app/scripts/seed.js
/**
 * Script para crear datos de prueba en la base de datos de Supabase
 * 
 * Para ejecutar este script:
 * 1. Crear un archivo .env.local con las credenciales de Supabase
 * 2. Ejecutar: node scripts/seed.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Necesario para crear usuarios

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  console.error('Faltan variables de entorno SUPABASE. Verifica tu archivo .env.local');
  process.exit(1);
}

// Cliente de Supabase con la clave de servicio para poder crear usuarios
const supabase = createClient(supabaseUrl, serviceRoleKey);

// Datos de ciudades principales de Ecuador
const ciudades = [
  'Quito',
  'Guayaquil',
  'Cuenca',
  'Santo Domingo',
  'Machala',
  'Durán',
  'Manta',
  'Portoviejo',
  'Loja',
  'Ambato'
];

// Datos de buses
const buses = [
  {
    numero: 'B001',
    capacidad: 40,
    tipo: 'Ejecutivo',
    caracteristicas: {
      'Wifi': true,
      'Aire acondicionado': true,
      'Baño': true,
      'TV': true,
      'Asientos reclinables': true
    }
  },
  {
    numero: 'B002',
    capacidad: 40,
    tipo: 'Ejecutivo',
    caracteristicas: {
      'Wifi': true,
      'Aire acondicionado': true,
      'Baño': true,
      'TV': true,
      'Asientos reclinables': true
    }
  },
  {
    numero: 'B003',
    capacidad: 45,
    tipo: 'Standard',
    caracteristicas: {
      'Aire acondicionado': true,
      'Baño': true,
      'Asientos reclinables': true
    }
  },
  {
    numero: 'B004',
    capacidad: 45,
    tipo: 'Standard',
    caracteristicas: {
      'Aire acondicionado': true,
      'Baño': true,
      'Asientos reclinables': true
    }
  },
  {
    numero: 'B005',
    capacidad: 50,
    tipo: 'Económico',
    caracteristicas: {
      'Baño': true
    }
  }
];

// Generar rutas entre ciudades
function generarRutas() {
  const rutas = [];
  
  for (let i = 0; i < ciudades.length; i++) {
    for (let j = 0; j < ciudades.length; j++) {
      if (i !== j) {
        // Generar una distancia aleatoria entre 50 y 500 km
        const distancia = Math.floor(Math.random() * 450) + 50;
        
        // Calcular duración estimada (promedio 60 km/h, convertido a minutos)
        const duracion_estimada = Math.floor((distancia / 60) * 60);
        
        rutas.push({
          origen: ciudades[i],
          destino: ciudades[j],
          distancia,
          duracion_estimada
        });
      }
    }
  }
  
  return rutas;
}

// Crear asientos para un bus
async function crearAsientos(busId, capacidad) {
  const asientos = [];
  
  // Distribuir asientos en filas (4 asientos por fila, 2 en cada lado con pasillo)
  for (let i = 1; i <= capacidad; i++) {
    let tipo;
    
    // Determinar tipo de asiento (ventana o pasillo)
    if (i % 4 === 1 || i % 4 === 0) {
      tipo = 'Ventana';
    } else {
      tipo = 'Pasillo';
    }
    
    asientos.push({
      bus_id: busId,
      numero: i,
      tipo
    });
  }
  
  // Insertar asientos en lotes
  for (let i = 0; i < asientos.length; i += 100) {
    const lote = asientos.slice(i, i + 100);
    const { error } = await supabase.from('asientos').insert(lote);
    
    if (error) {
      console.error('Error al crear asientos:', error);
      return false;
    }
  }
  
  return true;
}

// Generar horarios para rutas
function generarHorarios(rutaId, busId) {
  const horas = ['06:00:00', '08:00:00', '10:00:00', '12:00:00', '14:00:00', '16:00:00', '18:00:00', '20:00:00'];
  const diasSemana = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  
  const horarios = [];
  
  // Generar precio aleatorio entre $5 y $30
  const precio = Math.floor(Math.random() * 25) + 5;
  
  // Seleccionar horas aleatorias para esta ruta
  const horasSeleccionadas = horas.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 5) + 1);
  
  horasSeleccionadas.forEach(hora => {
    // Seleccionar días aleatorios de operación
    let diasOperacion = diasSemana.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 5) + 3);
    
    // Asegurarse de que siempre incluya al menos un día del fin de semana
    if (!diasOperacion.includes('sábado') && !diasOperacion.includes('domingo')) {
      diasOperacion.push('sábado');
    }
    
    horarios.push({
      ruta_id: rutaId,
      bus_id: busId,
      hora_salida: hora,
      dias_operacion: diasOperacion,
      precio
    });
  });
  
  return horarios;
}

// Función principal para poblar la base de datos
async function seed() {
  console.log('Iniciando el proceso de creación de datos de prueba...');
  
  // 1. Crear buses
  console.log('Creando buses...');
  const { data: busesData, error: busesError } = await supabase.from('buses').insert(buses).select();
  
  if (busesError) {
    console.error('Error al crear buses:', busesError);
    return;
  }
  
  console.log(`✅ ${busesData.length} buses creados correctamente`);
  
  // 2. Crear asientos para cada bus
  console.log('Creando asientos para los buses...');
  for (const bus of busesData) {
    await crearAsientos(bus.id, bus.capacidad);
  }
  
  console.log('✅ Asientos creados correctamente');
  
  // 3. Crear rutas
  console.log('Creando rutas...');
  const rutas = generarRutas();
  
  // Insertar rutas en lotes para evitar problemas con muchas inserciones
  let rutasCreadas = [];
  for (let i = 0; i < rutas.length; i += 100) {
    const lote = rutas.slice(i, i + 100);
    const { data: rutasData, error: rutasError } = await supabase.from('rutas').insert(lote).select();
    
    if (rutasError) {
      console.error('Error al crear rutas:', rutasError);
      continue;
    }
    
    rutasCreadas = [...rutasCreadas, ...rutasData];
  }
  
  console.log(`✅ ${rutasCreadas.length} rutas creadas correctamente`);
  
  // 4. Crear horarios para las rutas
  console.log('Creando horarios...');
  let horariosCreados = 0;
  
  for (const ruta of rutasCreadas) {
    // Seleccionar aleatoriamente 1-3 buses para esta ruta
    const busesSeleccionados = busesData
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.floor(Math.random() * 3) + 1);
    
    for (const bus of busesSeleccionados) {
      const horarios = generarHorarios(ruta.id, bus.id);
      
      const { data: horariosData, error: horariosError } = await supabase
        .from('horarios')
        .insert(horarios)
        .select();
      
      if (horariosError) {
        console.error('Error al crear horarios:', horariosError);
        continue;
      }
      
      horariosCreados += horariosData.length;
    }
  }
  
  console.log(`✅ ${horariosCreados} horarios creados correctamente`);
  
  console.log('✅ Proceso completado exitosamente');
}

// Ejecutar la función principal
seed()
  .catch(error => {
    console.error('Error durante el proceso de seeding:', error);
  })
  .finally(() => {
    process.exit(0);
  });