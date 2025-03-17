import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

export default function Registro() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  const { register, handleSubmit, formState: { errors }, watch } = useForm();
  const password = watch('password');

  const onSubmit = async (data) => {
    setIsLoading(true);
    
    try {
      // Registrar usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            nombre: data.nombre,
            apellido: data.apellido
          }
        }
      });

      if (authError) throw authError;

      // Actualizar el perfil del usuario con datos adicionales
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          nombre: data.nombre,
          apellido: data.apellido,
          cedula: data.cedula,
          telefono: data.telefono
        })
        .eq('id', authData.user.id);

      if (profileError) throw profileError;

      toast.success('Registro exitoso. Verifica tu correo electrónico.');
      router.push('/login');
    } catch (error) {
      console.error('Error al registrar:', error);
      toast.error(error.message || 'Error al registrar. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-8">
        <h2 className="text-2xl font-bold text-center mb-6">Crear una cuenta</h2>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                {...register('nombre', { required: 'El nombre es requerido' })}
                className="w-full p-2 border border-gray-300 rounded"
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
                className="w-full p-2 border border-gray-300 rounded"
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
              className="w-full p-2 border border-gray-300 rounded"
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
              className="w-full p-2 border border-gray-300 rounded"
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
              className="w-full p-2 border border-gray-300 rounded"
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
              className="w-full p-2 border border-gray-300 rounded"
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
              className="w-full p-2 border border-gray-300 rounded"
            />
            {errors.confirmPassword && (
              <p className="text-red-500 text-sm mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>
          
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white p-2 rounded hover:bg-opacity-90 disabled:opacity-50"
            >
              {isLoading ? 'Registrando...' : 'Registrarse'}
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