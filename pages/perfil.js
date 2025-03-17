///home/phiuser/phi/transporte-app/pages/perfil.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

export default function Perfil() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  
  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm();

  // Verificar autenticación y cargar datos del perfil
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Debes iniciar sesión para acceder a tu perfil');
        router.push('/login?redirect=/perfil');
        return;
      }
      
      setUser(session.user);
      await fetchProfile(session.user.id);
    };

    checkAuth();
  }, [router]);

  // Cargar datos del perfil
  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      
      setPerfil(data);
      
      // Establecer valores en el formulario
      setValue('nombre', data.nombre || '');
      setValue('apellido', data.apellido || '');
      setValue('cedula', data.cedula || '');
      setValue('telefono', data.telefono || '');
      setValue('email', user?.email || '');
    } catch (error) {
      console.error('Error al cargar perfil:', error);
      toast.error('Error al cargar datos del perfil');
    } finally {
      setLoading(false);
    }
  };

  // Manejar actualización del perfil
  const onSubmit = async (data) => {
    setUpdating(true);
    
    try {
      // Actualizar perfil
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          nombre: data.nombre,
          apellido: data.apellido,
          cedula: data.cedula,
          telefono: data.telefono
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Actualizar email si ha cambiado
      if (data.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: data.email
        });

        if (emailError) throw emailError;
        toast.success('Se ha enviado un enlace de confirmación a tu nuevo correo');
      }

      toast.success('Perfil actualizado con éxito');
      
      // Refrescar datos del perfil
      await fetchProfile(user.id);
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      toast.error(error.message || 'Error al actualizar el perfil');
    } finally {
      setUpdating(false);
    }
  };

  // Manejar cambio de contraseña
  const handleChangePassword = async () => {
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
            <a 
              href="/reservaciones" 
              className="text-primary hover:underline"
            >
              Ver historial de reservaciones
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}