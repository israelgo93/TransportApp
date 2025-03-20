// components/LinkWrapper.js
import React, { useCallback } from 'react';
import Link from 'next/link';
import { navigate, isExternalUrl } from '../lib/navigationService';

// Registro de último clic para prevenir doble navegación
let lastClickTime = 0;
const CLICK_THROTTLE = 200; // ms

const LinkWrapper = ({ href, children, className = "", prefetch = true, replace = false, ...props }) => {
  // Extraer las propiedades específicas que necesitamos
  const { onClick, target } = props;
  
  // Memoizamos el handler para evitar recreaciones en cada render
  const handleClick = useCallback((e) => {
    // Prevenir navegaciones muy cercanas en tiempo (doble clic)
    const now = Date.now();
    if (now - lastClickTime < CLICK_THROTTLE) {
      e.preventDefault();
      return;
    }
    lastClickTime = now;
    
    // Si hay un manejador personalizado, ejecutarlo
    if (onClick) {
      onClick(e);
      // Si el manejador personalizado ya previno el comportamiento predeterminado, respetarlo
      if (e.defaultPrevented) return;
    }

    // Prevenir el comportamiento predeterminado solo para enlaces internos
    // y sin atributos target
    if (!target && href && !isExternalUrl(href) && !href.startsWith('#')) {
      e.preventDefault();
      
      try {
        navigate(href, { replace });
      } catch (error) {
        console.error(`Error al navegar a ${href}:`, error);
        // Fallback a navegación estándar en caso de error
        window.location.href = href;
      }
    }
  }, [href, replace, onClick, target]); // Dependencias específicas en lugar de props completo

  // Eliminamos onClick de restProps ya que lo estamos manejando separadamente
  const { ...restProps } = props;

  return (
    <Link 
      href={href || '#'} // Asegurar que href nunca sea undefined
      className={className}
      prefetch={prefetch}
      onClick={handleClick}
      {...restProps}
    >
      {children}
    </Link>
  );
};

// Optimizar con memo para evitar rerenderizaciones innecesarias
export default React.memo(LinkWrapper);