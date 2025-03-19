/**
 * Servicio de navegación centralizado para la aplicación
 * Maneja de forma consistente las navegaciones internas y externas
 */

// Referencia al router que se establecerá durante la inicialización
let routerInstance = null;

/**
 * Inicializa el servicio con la instancia del router
 * @param {Object} router - Instancia del router de Next.js
 */
export function initNavigationService(router) {
  routerInstance = router;
}

/**
 * Navega a una ruta interna usando el router de Next.js (SPA sin recargas)
 * @param {string} path - Ruta a la que navegar
 * @param {Object} options - Opciones adicionales
 */
export function navigateTo(path, options = {}) {
  if (!routerInstance) {
    console.error('Router no inicializado en NavigationService');
    // Fallback en caso de que el router no esté disponible
    window.location.href = path;
    return;
  }

  // Usar shallow: true para evitar ejecutar getServerSideProps/getStaticProps si es necesario
  const { replace = false, shallow = false, ...routerOptions } = options;

  if (replace) {
    routerInstance.replace(path, undefined, { shallow, ...routerOptions });
  } else {
    routerInstance.push(path, undefined, { shallow, ...routerOptions });
  }
}

/**
 * Navega a un sitio externo o cuando se necesita recarga completa
 * @param {string} url - URL externa completa
 * @param {Object} options - Opciones adicionales
 */
export function navigateExternal(url, options = {}) {
  const { newTab = false, replace = false } = options;

  if (newTab) {
    window.open(url, '_blank');
  } else if (replace) {
    window.location.replace(url);
  } else {
    window.location.href = url;
  }
}

/**
 * Navega a la pasarela de pago de PlaceToPay
 * Esta función existe específicamente para documentar su propósito
 * @param {string} processUrl - URL de procesamiento proporcionada por PlaceToPay
 */
export function navigateToPaymentGateway(processUrl) {
  if (!processUrl) {
    console.error('URL de pasarela de pago no proporcionada');
    return;
  }
  
  // Siempre usamos window.location.href para ir a PlaceToPay
  // ya que necesitamos una recarga completa en este caso
  window.location.href = processUrl;
}

/**
 * Vuelve a la página anterior en el historial
 */
export function goBack() {
  if (routerInstance) {
    routerInstance.back();
  } else {
    window.history.back();
  }
}

/**
 * Recarga la página actual (usar solo cuando sea absolutamente necesario)
 */
export function reloadPage() {
  window.location.reload();
}

/**
 * Verifica si una URL es externa
 * @param {string} url - URL a verificar
 * @returns {boolean} - true si es externa, false si es interna
 */
export function isExternalUrl(url) {
  // Considerar URLs que comiencen con http o // como externas
  return /^(https?:)?\/\//.test(url);
}

/**
 * Gestiona la navegación eligiendo automáticamente el método apropiado
 * @param {string} url - URL a la que navegar
 * @param {Object} options - Opciones adicionales
 */
export function navigate(url, options = {}) {
  if (isExternalUrl(url)) {
    navigateExternal(url, options);
  } else {
    navigateTo(url, options);
  }
}

export default {
  initNavigationService,
  navigateTo,
  navigateExternal,
  navigateToPaymentGateway,
  goBack,
  reloadPage,
  navigate
};