/**
 * Utilidades generales para la aplicación
 */

/**
 * Previene el comportamiento predeterminado de un evento
 * @param {Event} e - El evento a prevenir
 */
export function preventDefault(e) {
  if (e && e.preventDefault) {
    e.preventDefault();
  }
  return false;
}

/**
 * Crea un manejador de eventos que previene el comportamiento predeterminado
 * y luego ejecuta la función proporcionada
 * @param {Function} fn - Función a ejecutar después de prevenir el comportamiento predeterminado
 * @returns {Function} - Manejador de eventos
 */
export function preventDefaultHandler(fn) {
  return (e) => {
    preventDefault(e);
    if (typeof fn === 'function') {
      fn(e);
    }
  };
}

/**
 * Formatea una fecha a formato local español
 * @param {string|Date} date - Fecha a formatear
 * @param {boolean} includeTime - Si se debe incluir la hora
 * @returns {string} - Fecha formateada
 */
export function formatDate(date, includeTime = false) {
  if (!date) return '';
  
  const dateObj = date instanceof Date ? date : new Date(date);
  
  // Opciones básicas de formato
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  
  // Añadir opciones de hora si se solicita
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  
  return dateObj.toLocaleDateString('es-EC', options);
}

/**
 * Formatea un precio a formato de moneda
 * @param {number} amount - Cantidad a formatear
 * @param {string} currency - Moneda (por defecto USD)
 * @returns {string} - Precio formateado
 */
export function formatCurrency(amount, currency = 'USD') {
  if (amount === undefined || amount === null) return '';
  
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * Desactiva temporalmente un botón para prevenir múltiples clics
 * @param {HTMLElement} buttonElement - Elemento del botón
 * @param {number} timeout - Tiempo en ms para desactivar el botón
 * @param {Function} callback - Función a ejecutar después del timeout
 */
export function debounceButton(buttonElement, timeout = 1000, callback = null) {
  if (!buttonElement) return;
  
  const originalText = buttonElement.innerHTML;
  buttonElement.disabled = true;
  buttonElement.innerHTML = 'Procesando...';
  
  setTimeout(() => {
    buttonElement.disabled = false;
    buttonElement.innerHTML = originalText;
    
    if (typeof callback === 'function') {
      callback();
    }
  }, timeout);
}

/**
 * Maneja errores de Supabase de manera consistente
 * @param {Error} error - Error de Supabase
 * @param {Function} toastFn - Función para mostrar notificaciones
 * @returns {string} - Mensaje de error formateado
 */
export function handleSupabaseError(error, toastFn = null) {
  if (!error) return '';
  
  // Mensajes de error comunes
  const errorMessages = {
    'PGRST116': 'No se encontró el recurso solicitado',
    '23505': 'Ya existe un registro con esos datos',
    '23503': 'El registro referenciado no existe',
    '23514': 'Violación de restricción'
  };
  
  // Intentar obtener un mensaje específico
  let message = errorMessages[error.code] || error.message || 'Error desconocido';
  
  // Mostrar toast si se proporciona la función
  if (toastFn && typeof toastFn === 'function') {
    toastFn(message);
  }
  
  console.error('Error en operación con Supabase:', error);
  return message;
}

/**
 * Genera un ID único para referencias
 * @returns {string} - ID único
 */
export function generateUniqueId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Crear un objeto con nombre para exportar (soluciona la advertencia ESLint)
const utils = {
  preventDefault,
  preventDefaultHandler,
  formatDate,
  formatCurrency,
  debounceButton,
  handleSupabaseError,
  generateUniqueId
};

export default utils;