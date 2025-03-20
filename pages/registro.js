import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { navigateTo } from '../lib/navigationService';
import { useAuth } from '../lib/AuthContext'; // Importamos useAuth para acceder al contexto centralizado

export default function Registro() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  // Obtenemos referencia al usuario del contexto centralizado
  const { user } = useAuth();
  
  const { register, handleSubmit, formState: { errors }, watch } = useForm();
  const password = watch('password');

  // Redirigir si el usuario ya está autenticado
  useEffect(() => {
    if (user) {
      // Usamos setTimeout para evitar conflictos con el ciclo de renderizado
      setTimeout(() => navigateTo('/'), 0);
    }
  }, [user]);

  const onSubmit = async (data) => {
    // Prevenir envíos múltiples
    if (isLoading) return;
    
    setIsLoading(true);
    
    try {
      console.log("Iniciando proceso de registro...");
      
      // 1. Registrar usuario en Supabase Auth
      // Importante: Evitar incluir demasiados datos en metadata
      // para prevenir problemas con el tamaño de los datos
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: `${data.nombre} ${data.apellido}`
          }
        }
      });

      if (authError) {
        console.error("Error en auth.signUp:", authError);
        throw authError;
      }

      if (!authData?.user?.id) {
        console.error("No se recibió user.id después del registro");
        throw new Error('No se pudo completar el registro. Intente nuevamente.');
      }

      console.log(`Usuario creado con ID: ${authData.user.id}`);
      
      // 2. Esperar un momento para que el trigger cree el perfil
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 3. Insertar o actualizar el perfil del usuario (upsert en lugar de solo update)
      console.log("Creando o actualizando perfil de usuario...");
      
      // Primero verificamos si el perfil ya existe
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authData.user.id)
        .maybeSingle();
        
      if (profileCheckError && profileCheckError.code !== 'PGRST116') {
        console.warn("Error al verificar perfil existente:", profileCheckError);
      }
      
      // Si el perfil existe o no está claro, intentamos una operación upsert
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          nombre: data.nombre,
          apellido: data.apellido,
          cedula: data.cedula,
          telefono: data.telefono,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id',
          ignoreDuplicates: false
        });

      if (profileError) {
        console.warn("Error al actualizar perfil:", profileError);
        // No lanzamos error aquí, porque el usuario ya está creado
        // Solo mostramos una advertencia
        toast.warn('Tu cuenta fue creada, pero hubo un problema al guardar tus datos personales. Podrás actualizarlos después de iniciar sesión.');
      } else {
        console.log("Perfil actualizado correctamente");
      }

      toast.success('Registro exitoso. Verifica tu correo electrónico.');
      
      // Redirigir después de un éxito (con breve retraso para mostrar el toast)
      setTimeout(() => navigateTo('/login'), 1500);
    } catch (error) {
      console.error('Error al registrar:', error);
      
      // Mensajes de error más específicos según el tipo de error
      if (error.message?.includes('already registered')) {
        toast.error('Este correo electrónico ya está registrado. Intenta con otro o recupera tu contraseña.');
      } else if (error.message?.includes('validation')) {
        toast.error('Datos de registro inválidos. Verifica la información ingresada.');
      } else {
        toast.error(error.message || 'Error al registrar. Inténtalo de nuevo.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-8">
        <h2 className="text-2xl font-bold text-center mb-6">Crear una cuenta</h2>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                {...register('nombre', { required: 'El nombre es requerido' })}
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isLoading}
              />
              {errors.nombre && (
                <p className="text-red-500 text-sm mt-1">{errors.nombre.message}</p>
              )}
            </div>
            
            <div>
              <label className="block text-gray-700 mb-1">Apellido</label>
              <input
                type="text"
                {...register('apellido', { required: 'El apellido es requerido' })}
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isLoading}
              />
              {errors.apellido && (
                <p className="text-red-500 text-sm mt-1">{errors.apellido.message}</p>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-gray-700 mb-1">Correo electrónico</label>
            <input
              type="email"
              {...register('email', { 
                required: 'El correo es requerido',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Correo electrónico inválido'
                }
              })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-gray-700 mb-1">Cédula</label>
            <input
              type="text"
              {...register('cedula', { 
                required: 'La cédula es requerida',
                pattern: {
                  value: /^\d{10}$/,
                  message: 'La cédula debe tener 10 dígitos'
                }
              })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={isLoading}
            />
            {errors.cedula && (
              <p className="text-red-500 text-sm mt-1">{errors.cedula.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-gray-700 mb-1">Teléfono</label>
            <input
              type="text"
              {...register('telefono', { 
                required: 'El teléfono es requerido',
                pattern: {
                  value: /^\d{10}$/,
                  message: 'El teléfono debe tener 10 dígitos'
                }
              })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={isLoading}
            />
            {errors.telefono && (
              <p className="text-red-500 text-sm mt-1">{errors.telefono.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              {...register('password', { 
                required: 'La contraseña es requerida',
                minLength: {
                  value: 8,
                  message: 'La contraseña debe tener al menos 8 caracteres'
                }
              })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={isLoading}
            />
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-gray-700 mb-1">Confirmar contraseña</label>
            <input
              type="password"
              {...register('confirmPassword', { 
                required: 'Confirma tu contraseña',
                validate: value => value === password || 'Las contraseñas no coinciden'
              })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-primary focus:border-transparent"
              disabled={isLoading}
            />
            {errors.confirmPassword && (
              <p className="text-red-500 text-sm mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>
          
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white p-3 rounded hover:bg-opacity-90 transition duration-200 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Registrando...
                </div>
              ) : (
                'Registrarse'
              )}
            </button>
          </div>
        </form>
        
        <div className="mt-4 text-center">
          <p className="text-gray-600">
            ¿Ya tienes una cuenta?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}