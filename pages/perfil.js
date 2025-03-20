///home/phiuser/phi/transporte-app/pages/perfil.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext'; // Importamos useAuth para acceder al contexto centralizado

export default function Perfil() {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  // Usamos el hook de autenticación centralizado
  const { user, profile, loading, updateProfile } = useAuth();
  
  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm();

  // Efecto para establecer valores en el formulario cuando cambia el perfil
  useEffect(() => {
    // Solo configurar el formulario si tenemos datos de perfil
    if (profile) {
      setValue('nombre', profile.nombre || '');
      setValue('apellido', profile.apellido || '');
      setValue('cedula', profile.cedula || '');
      setValue('telefono', profile.telefono || '');
    }
    
    // Establecer el email directamente desde user
    if (user && user.email) {
      setValue('email', user.email);
    }
  }, [profile, user, setValue]); // Dependencias explícitas

  // Redirigir si no hay usuario autenticado
  useEffect(() => {
    if (!loading && !user) {
      toast.error('Debes iniciar sesión para acceder a tu perfil');
      router.push('/login?redirect=/perfil');
    }
  }, [user, loading, router]);

  // Manejar actualización del perfil
  const onSubmit = async (data) => {
    // Evitar múltiples envíos
    if (updating) return;
    
    setUpdating(true);
    
    try {
      // Actualizar perfil usando la función del contexto
      const { success, error: profileError } = await updateProfile({
        nombre: data.nombre,
        apellido: data.apellido,
        cedula: data.cedula,
        telefono: data.telefono
      });

      if (!success) throw profileError;

      // Actualizar email si ha cambiado
      if (data.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: data.email
        });

        if (emailError) throw emailError;
        toast.success('Se ha enviado un enlace de confirmación a tu nuevo correo');
      }

      toast.success('Perfil actualizado con éxito');
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      toast.error(error.message || 'Error al actualizar el perfil');
    } finally {
      setUpdating(false);
    }
  };

  // Manejar cambio de contraseña
  const handleChangePassword = async () => {
    if (!user) {
      toast.error('Debes iniciar sesión para cambiar tu contraseña');
      return;
    }
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      
      toast.success('Se ha enviado un enlace para cambiar tu contraseña');
    } catch (error) {
      console.error('Error al solicitar cambio de contraseña:', error);
      toast.error(error.message || 'Error al solicitar cambio de contraseña');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Cargando información del perfil...</p>
        </div>
      </div>
    );
  }

  // Si no hay usuario después de cargar, no renderizar el contenido
  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Mi Perfil</h1>
      
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-4 bg-primary text-white">
          <h2 className="text-lg font-semibold">Información personal</h2>
        </div>
        
        <div className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-700 mb-2">Nombre</label>
                <input
                  type="text"
                  {...register('nombre', { required: 'El nombre es requerido' })}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={updating}
                />
                {errors.nombre && (
                  <p className="text-red-500 text-sm mt-1">{errors.nombre.message}</p>
                )}
              </div>
              
              <div>
                <label className="block text-gray-700 mb-2">Apellido</label>
                <input
                  type="text"
                  {...register('apellido', { required: 'El apellido es requerido' })}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={updating}
                />
                {errors.apellido && (
                  <p className="text-red-500 text-sm mt-1">{errors.apellido.message}</p>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-gray-700 mb-2">Correo electrónico</label>
              <input
                type="email"
                {...register('email', { 
                  required: 'El correo es requerido',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Correo electrónico inválido'
                  }
                })}
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={updating}
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-700 mb-2">Cédula</label>
                <input
                  type="text"
                  {...register('cedula', { 
                    required: 'La cédula es requerida',
                    pattern: {
                      value: /^\d{10}$/,
                      message: 'La cédula debe tener 10 dígitos'
                    }
                  })}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={updating}
                />
                {errors.cedula && (
                  <p className="text-red-500 text-sm mt-1">{errors.cedula.message}</p>
                )}
              </div>
              
              <div>
                <label className="block text-gray-700 mb-2">Teléfono</label>
                <input
                  type="text"
                  {...register('telefono', { 
                    required: 'El teléfono es requerido',
                    pattern: {
                      value: /^\d{10}$/,
                      message: 'El teléfono debe tener 10 dígitos'
                    }
                  })}
                  className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={updating}
                />
                {errors.telefono && (
                  <p className="text-red-500 text-sm mt-1">{errors.telefono.message}</p>
                )}
              </div>
            </div>
            
            <div className="flex justify-between items-center pt-4 border-t">
              <button
                type="button"
                onClick={handleChangePassword}
                className="text-primary hover:underline"
                disabled={updating}
              >
                Cambiar contraseña
              </button>
              
              <button
                type="submit"
                disabled={updating}
                className="bg-primary text-white px-6 py-2 rounded hover:bg-opacity-90 disabled:opacity-50"
              >
                {updating ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden">
        <div className="p-4 bg-primary text-white">
          <h2 className="text-lg font-semibold">Historial de Viajes</h2>
        </div>
        
        <div className="p-6">
          <p className="text-gray-600">Aquí podrás ver tu historial de viajes realizados.</p>
          
          <div className="mt-4">
            <Link 
              href="/reservaciones" 
              className="text-primary hover:underline"
            >
              Ver historial de reservaciones
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}