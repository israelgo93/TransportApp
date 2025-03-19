/**
 * Componente LinkWrapper
 * 
 * Este componente envuelve los enlaces de Next.js y les añade funcionalidad
 * para prevenir el comportamiento predeterminado cuando se manejan a través
 * del servicio de navegación.
 */

import React from 'react';
import Link from 'next/link';
import { navigate } from '../lib/navigationService';

const LinkWrapper = ({ href, children, className = "", prefetch = true, replace = false, ...props }) => {
  const handleClick = (e) => {
    // Si hay un manejador personalizado, ejecutarlo
    if (props.onClick) {
      props.onClick(e);
    }

    // Prevenir el comportamiento predeterminado solo para enlaces internos
    // y sin atributos target
    if (!props.target && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('#')) {
      e.preventDefault();
      navigate(href, { replace });
    }
  };

  // Eliminar el manejador de clic personalizado para pasarlo al elemento Link
  const { onClick, ...restProps } = props;

  return (
    <Link 
      href={href} 
      className={className}
      prefetch={prefetch}
      onClick={handleClick}
      {...restProps}
    >
      {children}
    </Link>
  );
};

export default LinkWrapper;