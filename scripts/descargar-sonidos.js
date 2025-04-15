// scripts/descargar-sonidos.js
/**
 * Script para descargar los archivos de sonido necesarios para el verificador de boletos
 * Este script debe ejecutarse desde la raíz del proyecto
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// URLs de sonidos libres de derechos (ejemplos)
const sonidos = [
  {
    nombre: 'success.mp3',
    url: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3',
    descripcion: 'Sonido de éxito para boletos válidos'
  },
  {
    nombre: 'warning.mp3',
    url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    descripcion: 'Sonido de advertencia para boletos ya utilizados'
  },
  {
    nombre: 'error.mp3',
    url: 'https://assets.mixkit.co/active_storage/sfx/2005/2005-preview.mp3',
    descripcion: 'Sonido de error para boletos inválidos o caducados'
  }
];

// Directorio de destino
const dirDestino = path.join(process.cwd(), 'public', 'sounds');

// Crear el directorio si no existe
if (!fs.existsSync(dirDestino)) {
  fs.mkdirSync(dirDestino, { recursive: true });
  console.log(`Directorio creado: ${dirDestino}`);
}

// Función para descargar un archivo
function descargarArchivo(url, rutaDestino) {
  return new Promise((resolve, reject) => {
    const archivo = fs.createWriteStream(rutaDestino);
    
    https.get(url, (respuesta) => {
      respuesta.pipe(archivo);
      
      archivo.on('finish', () => {
        archivo.close();
        resolve();
      });
      
      archivo.on('error', (err) => {
        fs.unlink(rutaDestino, () => {}); // Eliminar archivo incompleto
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(rutaDestino, () => {}); // Eliminar archivo incompleto
      reject(err);
    });
  });
}

// Descargar todos los sonidos
async function descargarSonidos() {
  console.log('Iniciando descarga de archivos de sonido...');
  
  for (const sonido of sonidos) {
    const rutaDestino = path.join(dirDestino, sonido.nombre);
    
    try {
      console.log(`Descargando ${sonido.nombre}...`);
      await descargarArchivo(sonido.url, rutaDestino);
      console.log(`✅ ${sonido.nombre} descargado correctamente`);
    } catch (error) {
      console.error(`❌ Error al descargar ${sonido.nombre}:`, error.message);
      
      // Si falla la descarga, crear un archivo vacío como placeholder
      try {
        fs.writeFileSync(rutaDestino, '');
        console.log(`  Archivo placeholder creado para ${sonido.nombre}`);
      } catch (err) {
        console.error(`  No se pudo crear archivo placeholder: ${err.message}`);
      }
    }
  }
  
  console.log('\nResumen de archivos de sonido:');
  sonidos.forEach(sonido => {
    const rutaArchivo = path.join(dirDestino, sonido.nombre);
    const existe = fs.existsSync(rutaArchivo);
    const tamaño = existe ? fs.statSync(rutaArchivo).size : 0;
    
    console.log(`- ${sonido.nombre}: ${existe ? '✅ OK' : '❌ No disponible'} (${tamaño} bytes)`);
    console.log(`  ${sonido.descripcion}`);
  });
  
  console.log('\nNota: Si los archivos no se descargaron correctamente, puedes:');
  console.log('1. Descargar manualmente sonidos MP3 y guardarlos con los nombres correctos en public/sounds/');
  console.log('2. O reemplazar estos archivos con otros sonidos de tu preferencia.');
}

// Ejecutar la función principal
descargarSonidos().catch(error => {
  console.error('Error general:', error);
  process.exit(1);
});