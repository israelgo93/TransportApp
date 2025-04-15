// components/EstadoBoleto.js
import React, { useMemo } from 'react';

/**
 * Componente para mostrar el estado de un boleto de forma visual
 * Puede ser usado en cualquier parte de la aplicación donde se necesite mostrar
 * el estado de un boleto (válido, usado, caducado, etc.)
 */
const EstadoBoleto = ({ 
  estado, 
  fechaViaje, 
  fechaValidacion,
  esValidado = false, // Indica si el boleto ha sido validado en el sistema de verificación
  mostrarFecha = true // Mostrar o no la fecha de validación/viaje
}) => {
  
  // Calcular estado real teniendo en cuenta la fecha
  const { displayEstado, badgeColor, iconoEstado } = useMemo(() => {
    // Si ya tenemos un estado explícito (como 'Usado' o 'Validado'), usarlo
    if (esValidado) {
      return {
        displayEstado: 'Utilizado',
        badgeColor: 'bg-yellow-100 text-yellow-800',
        iconoEstado: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      };
    }
    
    // Verificar si el boleto ha caducado basado en la fecha
    if (fechaViaje) {
      const fechaViajeObj = new Date(fechaViaje);
      fechaViajeObj.setHours(23, 59, 59, 999); // Final del día
      
      if (fechaViajeObj < new Date()) {
        return {
          displayEstado: 'Caducado',
          badgeColor: 'bg-red-100 text-red-800',
          iconoEstado: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )
        };
      }
    }
    
    // Mapear el estado del boleto a una representación visual
    switch (estado) {
      case 'Confirmada':
        return {
          displayEstado: 'Válido',
          badgeColor: 'bg-green-100 text-green-800',
          iconoEstado: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'Pendiente':
        return {
          displayEstado: 'Pendiente',
          badgeColor: 'bg-yellow-100 text-yellow-800',
          iconoEstado: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          )
        };
      case 'Cancelada':
        return {
          displayEstado: 'Cancelado',
          badgeColor: 'bg-red-100 text-red-800',
          iconoEstado: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )
        };
      default:
        return {
          displayEstado: estado || 'Desconocido',
          badgeColor: 'bg-gray-100 text-gray-800',
          iconoEstado: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          )
        };
    }
  }, [estado, fechaViaje, esValidado]);

  return (
    <div className={`flex items-center ${badgeColor} px-3 py-1 rounded-full`}>
      {iconoEstado}
      <span className="font-medium">{displayEstado}</span>
      
      {mostrarFecha && (
        <>
          {esValidado && fechaValidacion && (
            <span className="ml-1 text-xs">
              ({new Date(fechaValidacion).toLocaleString()})
            </span>
          )}
          
          {!esValidado && fechaViaje && displayEstado === 'Caducado' && (
            <span className="ml-1 text-xs">
              (Fecha: {new Date(fechaViaje).toLocaleDateString()})
            </span>
          )}
        </>
      )}
    </div>
  );
};

export default EstadoBoleto;