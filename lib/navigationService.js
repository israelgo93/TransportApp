/**
 * Servicio de navegación centralizado para la aplicación
 * Maneja de forma consistente las navegaciones internas y externas
 */

// Referencia al router que se establecerá durante la inicialización
let routerInstance = null;
// Rastreo de la última ruta para evitar navegaciones redundantes
let lastNavigatedPath = null;
// Tiempo de la última navegación para evitar navegaciones muy frecuentes
let lastNavigationTime = 0;
// Tiempo mínimo entre navegaciones en ms (150ms debería ser suficiente para evitar navegaciones accidentales duplicadas)
const NAVIGATION_THROTTLE = 150;

/**
 * Inicializa el servicio con la instancia del router
 * @param {Object} router - Instancia del router de Next.js
 */
export function initNavigationService(router) {
  if (!router) {
    console.error('Error: Se intentó inicializar NavigationService con un router nulo');
    return;
  }
  
  routerInstance = router;
  // Inicializar lastNavigatedPath con la ruta actual
  lastNavigatedPath = router.asPath;
  
  // Suscribirse a cambios de ruta para actualizar lastNavigatedPath
  router.events.on('routeChangeComplete', (path) => {
    lastNavigatedPath = path;
    lastNavigationTime = Date.now();
  });
  
  console.log('NavigationService inicializado correctamente');
}

/**
 * Determina si una navegación debe ser bloqueada debido a restricciones de tiempo o ruta
 * @param {string} path - Ruta a la que se intenta navegar
 * @returns {boolean} - true si debe ser bloqueada, false si es permitida
 */
function shouldBlockNavigation(path) {
  // Si es la misma ruta que la actual y ha pasado poco tiempo, bloquear
  const now = Date.now();
  const timeSinceLastNav = now - lastNavigationTime;
  
  if (path === lastNavigatedPath && timeSinceLastNav < NAVIGATION_THROTTLE) {
    console.log(`Navegación bloqueada: Intento demasiado frecuente a la misma ruta (${timeSinceLastNav}ms)`);
    return true;
  }
  
  return false;
}

/**
 * Navega a una ruta interna usando el router de Next.js (SPA sin recargas)
 * @param {string} path - Ruta a la que navegar
 * @param {Object} options - Opciones adicionales
 */
export function navigateTo(path, options = {}) {
  // Validar parámetros
  if (!path) {
    console.error('Error: Se intentó navegar a una ruta vacía');
    return;
  }
  
  // Verificar si debemos bloquear esta navegación
  if (shouldBlockNavigation(path)) {
    return;
  }
  
  if (!routerInstance) {
    console.error('Router no inicializado en NavigationService');
    // Fallback en caso de que el router no esté disponible
    window.location.href = path;
    return;
  }

  // Actualizar tiempo de navegación
  lastNavigationTime = Date.now();
  
  // Usar shallow: true para evitar ejecutar getServerSideProps/getStaticProps si es necesario
  const { replace = false, shallow = false, ...routerOptions } = options;

  try {
    if (replace) {
      routerInstance.replace(path, undefined, { shallow, ...routerOptions });
    } else {
      routerInstance.push(path, undefined, { shallow, ...routerOptions });
    }
  } catch (error) {
    console.error('Error durante la navegación:', error);
    // Fallback a navegación tradicional en caso de error
    window.location.href = path;
  }
}

/**
 * Navega a un sitio externo o cuando se necesita recarga completa
 * @param {string} url - URL externa completa
 * @param {Object} options - Opciones adicionales
 */
export function navigateExternal(url, options = {}) {
  if (!url) {
    console.error('Error: Se intentó navegar a una URL externa vacía');
    return;
  }
  
  const { newTab = false, replace = false } = options;

  try {
    if (newTab) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (replace) {
      window.location.replace(url);
    } else {
      window.location.href = url;
    }
  } catch (error) {
    console.error('Error en navegación externa:', error);
  }
}

/**
 * Navega a la pasarela de pago de PlaceToPay
 * Esta función existe específicamente para documentar su propósito
 * y manejar adecuadamente la navegación a un sistema externo
 * @param {string} processUrl - URL de procesamiento proporcionada por PlaceToPay
 */
export function navigateToPaymentGateway(processUrl) {
  if (!processUrl) {
    console.error('URL de pasarela de pago no proporcionada');
    return;
  }
  
  // Registro para depuración
  console.log(`Navegando a pasarela de pago: ${processUrl.substring(0, 30)}...`);
  
  try {
    // Establecer referencia para regresar a la aplicación
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem('returnFromPayment', 'true');
      window.sessionStorage.setItem('paymentTime', Date.now().toString());
    }
    
    // Siempre usamos window.location.href para ir a PlaceToPay
    // ya que necesitamos una recarga completa en este caso
    window.location.href = processUrl;
  } catch (error) {
    console.error('Error al navegar a la pasarela de pago:', error);
  }
}

/**
 * Vuelve a la página anterior en el historial
 */
export function goBack() {
  try {
    if (routerInstance) {
      routerInstance.back();
    } else {
      window.history.back();
    }
  } catch (error) {
    console.error('Error al navegar hacia atrás:', error);
  }
}

/**
 * Recarga la página actual (usar solo cuando sea absolutamente necesario)
 */
export function reloadPage() {
  try {
    console.log('Recargando página manualmente...');
    window.location.reload();
  } catch (error) {
    console.error('Error al recargar la página:', error);
  }
}

/**
 * Verifica si una URL es externa
 * @param {string} url - URL a verificar
 * @returns {boolean} - true si es externa, false si es interna
 */
export function isExternalUrl(url) {
  if (!url) return false;
  
  // Considerar URLs que comiencen con http o // como externas
  return /^(https?:)?\/\//.test(url);
}

/**
 * Gestiona la navegación eligiendo automáticamente el método apropiado
 * @param {string} url - URL a la que navegar
 * @param {Object} options - Opciones adicionales
 */
export function navigate(url, options = {}) {
  if (!url) {
    console.error('Error: Se intentó navegar a una URL vacía');
    return;
  }
  
  if (isExternalUrl(url)) {
    navigateExternal(url, options);
  } else {
    navigateTo(url, options);
  }
}

// Crear un objeto con nombre para exportar (soluciona la advertencia ESLint)
const navigationService = {
  initNavigationService,
  navigateTo,
  navigateExternal,
  navigateToPaymentGateway,
  goBack,
  reloadPage,
  isExternalUrl,
  navigate
};

export default navigationService;