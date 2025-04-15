// pages/historial-verificaciones.js
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import toast from 'react-hot-toast';

export default function HistorialVerificaciones() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  // Estados para la interfaz y datos
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  
  // Cargar registros del historial
  const cargarHistorial = useCallback(async (filtros = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/registro-verificaciones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filtros)
      });
      
      if (!response.ok) {
        throw new Error(`Error al cargar historial: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setRegistros(data.registros);
      } else {
        throw new Error(data.message || 'Error al cargar registros');
      }
    } catch (error) {
      console.error('Error al cargar historial:', error);
      setError(error.message || 'Error al cargar historial de verificaciones');
      toast.error('Error al cargar historial');
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Aplicar filtros de fecha
  const aplicarFiltros = (e) => {
    e.preventDefault();
    
    cargarHistorial({
      fechaInicio: filtroFechaInicio || undefined,
      fechaFin: filtroFechaFin || undefined
    });
  };
  
  // Limpiar filtros
  const limpiarFiltros = () => {
    setFiltroFechaInicio('');
    setFiltroFechaFin('');
    cargarHistorial();
  };

  // Proteger la ruta - sólo para personal autorizado
  useEffect(() => {
    if (!authLoading && !user) {
      toast.error('Debes iniciar sesión para acceder al historial de verificaciones');
      router.push('/login?redirect=/historial-verificaciones');
      return;
    }
    
    if (user) {
      // Cargar datos iniciales
      cargarHistorial();
    }
  }, [user, authLoading, router, cargarHistorial]);

  // Si está cargando la autenticación o no hay usuario, mostrar carga
  if (authLoading || (!authLoading && !user)) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Historial de Verificaciones | TransportApp Ecuador</title>
      </Head>
      
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="p-4 bg-primary text-white flex justify-between items-center">
            <h1 className="text-xl font-bold">Historial de Verificaciones</h1>
            <Link href="/verificador" className="text-sm py-1 px-3 rounded bg-white bg-opacity-20 hover:bg-opacity-30 transition-colors">
              Volver al verificador
            </Link>
          </div>
          
          <div className="p-6">
            {/* Filtros */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Filtros</h2>
              <form onSubmit={aplicarFiltros} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Fecha inicio</label>
                  <input
                    type="date"
                    value={filtroFechaInicio}
                    onChange={(e) => setFiltroFechaInicio(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-600 mb-2">Fecha fin</label>
                  <input
                    type="date"
                    value={filtroFechaFin}
                    onChange={(e) => setFiltroFechaFin(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded"
                  />
                </div>
                
                <div className="flex items-end space-x-2 md:col-span-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90"
                    disabled={loading}
                  >
                    {loading ? 'Cargando...' : 'Aplicar filtros'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                    disabled={loading}
                  >
                    Limpiar
                  </button>
                </div>
              </form>
            </div>
            
            {/* Tabla de registros */}
            {error ? (
              <div className="bg-red-100 p-4 rounded text-red-700 mb-4">
                <p>{error}</p>
              </div>
            ) : loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : registros.length === 0 ? (
              <div className="bg-gray-100 p-6 rounded-lg text-center">
                <p className="text-gray-600">No se encontraron registros de verificación para el período especificado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="py-3 px-4 text-left border-b">Fecha/Hora</th>
                      <th className="py-3 px-4 text-left border-b">Tipo</th>
                      <th className="py-3 px-4 text-left border-b">Código</th>
                      <th className="py-3 px-4 text-left border-b">Referencia</th>
                      <th className="py-3 px-4 text-left border-b">Ruta</th>
                      <th className="py-3 px-4 text-left border-b">Fecha Viaje</th>
                      <th className="py-3 px-4 text-left border-b">Hora</th>
                      <th className="py-3 px-4 text-left border-b">Bus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map((registro) => (
                      <tr key={registro.id} className="hover:bg-gray-50">
                        <td className="py-3 px-4 border-b">
                          {new Date(registro.fecha).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 border-b">
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                            registro.tipo === 'QR' ? 
                              'bg-blue-100 text-blue-800' : 
                              'bg-purple-100 text-purple-800'
                          }`}>
                            {registro.tipo}
                          </span>
                        </td>
                        <td className="py-3 px-4 border-b font-mono text-sm">
                          {registro.codigo}
                        </td>
                        <td className="py-3 px-4 border-b">
                          {registro.referencia}
                        </td>
                        <td className="py-3 px-4 border-b">
                          {registro.ruta}
                        </td>
                        <td className="py-3 px-4 border-b">
                          {registro.fechaViaje !== 'N/A' 
                            ? new Date(registro.fechaViaje).toLocaleDateString() 
                            : 'N/A'}
                        </td>
                        <td className="py-3 px-4 border-b">
                          {registro.horaSalida}
                        </td>
                        <td className="py-3 px-4 border-b">
                          {registro.bus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {/* Resumen */}
            {registros.length > 0 && (
              <div className="mt-4 bg-gray-50 p-4 rounded">
                <p className="text-gray-700">
                  Mostrando {registros.length} registros de verificación.
                </p>
              </div>
            )}
          </div>
        </div>
        
        <div className="text-center mb-6">
          <Link href="/" className="text-primary hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    </>
  );
}