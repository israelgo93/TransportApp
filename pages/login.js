///home/phiuser/phi/transporte-app/pages/login.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { navigateTo } from '../lib/navigationService';
import { useAuth } from '../lib/AuthContext'; // Importamos useAuth para acceder al contexto centralizado

export default function Login() {
  const router = useRouter();
  const { redirect } = router.query;
  const [isLoading, setIsLoading] = useState(false);
  // Usamos el hook de autenticación centralizado
  const { signIn, user } = useAuth();
  
  const { register, handleSubmit, formState: { errors } } = useForm();

  // Redirigir si el usuario ya está autenticado
  useEffect(() => {
    if (user) {
      const redirectPath = redirect ? decodeURIComponent(redirect) : '/';
      // Usamos setTimeout para evitar conflictos con el ciclo de renderizado
      setTimeout(() => navigateTo(redirectPath), 0);
    }
  }, [user, redirect]);

  const onSubmit = async (data) => {
    // Prevenir múltiples envíos
    if (isLoading) return;
    
    setIsLoading(true);
    
    try {
      // Usar la función centralizada de inicio de sesión
      const result = await signIn(data.email, data.password);

      if (!result.success) {
        throw new Error(result.error?.message || 'Error al iniciar sesión. Verifica tus credenciales.');
      }

      toast.success('Inicio de sesión exitoso');
      
      // No necesitamos redirigir aquí, el useEffect se encargará
      // cuando el estado del usuario se actualice
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      toast.error(error.message || 'Error al iniciar sesión. Verifica tus credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const email = prompt('Ingresa tu correo electrónico para restablecer la contraseña:');
    
    if (!email) return;
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;
      
      toast.success('Se ha enviado un enlace a tu correo para restablecer la contraseña');
    } catch (error) {
      console.error('Error al solicitar restablecimiento:', error);
      toast.error(error.message || 'Error al solicitar restablecimiento de contraseña');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-8">
        <h2 className="text-2xl font-bold text-center mb-6">Iniciar Sesión</h2>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              {...register('password', { required: 'La contraseña es requerida' })}
              className="w-full p-2 border border-gray-300 rounded"
              disabled={isLoading}
            />
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
            )}
          </div>
          
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleResetPassword}
              className="text-sm text-primary hover:underline"
              disabled={isLoading}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
          
          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white p-2 rounded hover:bg-opacity-90 disabled:opacity-50"
            >
              {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </div>
        </form>
        
        <div className="mt-4 text-center">
          <p className="text-gray-600">
            ¿No tienes una cuenta?{' '}
            <Link href="/registro" className="text-primary hover:underline">
              Regístrate
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}