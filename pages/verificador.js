// pages/verificador.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import toast from 'react-hot-toast';

// Constantes para los estados de verificación
const VERIFICATION_STATUS = {
  INITIAL: 'initial',
  SCANNING: 'scanning',
  SUCCESS: 'success',
  USED: 'used',
  EXPIRED: 'expired',
  INVALID: 'invalid',
  ERROR: 'error'
};

// Componente principal del verificador
export default function Verificador() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  
  // Referencias para elementos DOM y audio
  const inputRef = useRef(null);
  const audioSuccessRef = useRef(null);
  const audioErrorRef = useRef(null);
  const audioWarningRef = useRef(null);
  
  // Estados para la interfaz y verificación
  const [status, setStatus] = useState(VERIFICATION_STATUS.INITIAL);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [processingCode, setProcessingCode] = useState(false);
  const [lastVerification, setLastVerification] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [scannerTest, setScannerTest] = useState('');
  const [showScannerTest, setShowScannerTest] = useState(false);
  
  // Limpiar el estado después de una verificación
  const resetStatusAfterDelay = useCallback((delay = 5000) => {
    setTimeout(() => {
      setStatus(VERIFICATION_STATUS.SCANNING);
      setLastScannedCode('');
    }, delay);
  }, []);

  // Reproduce el sonido apropiado según el resultado
  const playSound = useCallback((type) => {
    try {
      if (type === 'success' && audioSuccessRef.current) {
        audioSuccessRef.current.play();
      } else if (type === 'error' && audioErrorRef.current) {
        audioErrorRef.current.play();
      } else if (type === 'warning' && audioWarningRef.current) {
        audioWarningRef.current.play();
      }
    } catch (error) {
      console.error('Error reproduciendo sonido:', error);
    }
  }, []);

  // Función para verificar un código (QR o barras)
  const verifyCode = useCallback(async (code) => {
    if (!code || isProcessing) return;
    
    setIsProcessing(true);
    setLastScannedCode(code);
    
    try {
      // Llamar a la API para verificar el código
      const response = await fetch('/api/verificar-boleto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ codigo: code })
      });
      
      const data = await response.json();
      
      // Añadir al historial
      const verificationResult = {
        code,
        timestamp: new Date().toISOString(),
        status: data.success ? data.status : 'ERROR',
        message: data.message,
        boleto: data.boleto
      };
      
      setHistorial(prev => [verificationResult, ...prev].slice(0, 10));
      setLastVerification(verificationResult);
      
      // Mostrar resultado
      if (data.success) {
        // Determinar el tipo de éxito/error
        if (data.status === 'VALID') {
          setStatus(VERIFICATION_STATUS.SUCCESS);
          playSound('success');
        } else if (data.status === 'USED') {
          setStatus(VERIFICATION_STATUS.USED);
          playSound('warning');
        } else if (data.status === 'EXPIRED') {
          setStatus(VERIFICATION_STATUS.EXPIRED);
          playSound('error');
        } else {
          setStatus(VERIFICATION_STATUS.INVALID);
          playSound('error');
        }
      } else {
        setStatus(VERIFICATION_STATUS.INVALID);
        playSound('error');
      }
      
      resetStatusAfterDelay();
    } catch (error) {
      console.error('Error al verificar código:', error);
      setStatus(VERIFICATION_STATUS.ERROR);
      playSound('error');
      resetStatusAfterDelay();
    } finally {
      setIsProcessing(false);
      setManualCode('');
    }
  }, [isProcessing, playSound, resetStatusAfterDelay]);

  // Manejar escaneo desde el lector de código de barras
  const handleScan = useCallback((event) => {
    // Capturar el código cuando el lector envía un "Enter" después del escaneo
    if (event.key === 'Enter' && inputRef.current) {
      const code = inputRef.current.value.trim();
      
      // Si estamos en modo de prueba del lector
      if (showScannerTest) {
        setScannerTest(code);
        inputRef.current.value = ''; // Limpiar el campo
        return;
      }
      
      // Si tenemos un código válido, proceder con la verificación
      if (code) {
        inputRef.current.value = ''; // Limpiar el campo para el próximo escaneo
        
        if (code !== lastScannedCode) {
          verifyCode(code);
        }
      }
    }
  }, [lastScannedCode, verifyCode, showScannerTest]);

  // Manejar verificación manual
  const handleManualVerify = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      verifyCode(manualCode.trim());
    }
  };

  // Inicializar página y establecer estado inicial
  useEffect(() => {
    setStatus(VERIFICATION_STATUS.SCANNING);
    
    // Configurar focus en el input para capturar escaneos del lector
    const interval = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, 500);
    
    // Limpiar intervalo al desmontar
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Configurar event listeners para el lector
  useEffect(() => {
    // Añadir listener para escaneo
    document.addEventListener('keydown', handleScan);
    
    // Limpiar listener al desmontar
    return () => {
      document.removeEventListener('keydown', handleScan);
    };
  }, [handleScan]);

  // Proteger la ruta - sólo para personal autorizado
  useEffect(() => {
    if (!authLoading && !user) {
      toast.error('Debes iniciar sesión para acceder al verificador de boletos');
      router.push('/login?redirect=/verificador');
    }
  }, [user, authLoading, router]);

  // Renderizar el estado correspondiente
  const renderStatus = () => {
    switch (status) {
      case VERIFICATION_STATUS.INITIAL:
        return (
          <div className="text-center p-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-blue-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
            </svg>
            <h2 className="text-xl font-semibold mb-4">Inicializando verificador</h2>
            <p className="text-gray-600">Preparando sistema de verificación...</p>
            <div className="mt-4">
              <div className="animate-pulse flex space-x-4 justify-center">
                <div className="h-3 w-3 bg-blue-400 rounded-full"></div>
                <div className="h-3 w-3 bg-blue-400 rounded-full"></div>
                <div className="h-3 w-3 bg-blue-400 rounded-full"></div>
              </div>
            </div>
          </div>
        );
      
      case VERIFICATION_STATUS.SCANNING:
        return (
          <div className="text-center p-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-blue-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <h2 className="text-xl font-semibold mb-4">Listo para escanear</h2>
            <p className="text-gray-600">Acerca el código QR o de barras al lector</p>
            <div className="mt-4">
              <div className="animate-bounce h-10 w-10 mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            </div>
          </div>
        );
      
      case VERIFICATION_STATUS.SUCCESS:
        return (
          <div className="text-center p-8 bg-green-50 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-semibold text-green-800 mb-4">¡Boleto Válido!</h2>
            <div className="px-4 py-2 bg-white rounded-lg shadow-sm mb-4">
              <p className="font-medium">Código: {lastScannedCode}</p>
              {lastVerification?.boleto && (
                <div className="mt-2 text-sm text-left">
                  <p><span className="font-medium">Ruta:</span> {lastVerification.boleto.origen} → {lastVerification.boleto.destino}</p>
                  <p><span className="font-medium">Fecha:</span> {new Date(lastVerification.boleto.fecha_viaje).toLocaleDateString()}</p>
                  <p><span className="font-medium">Hora:</span> {lastVerification.boleto.hora_salida}</p>
                  <p><span className="font-medium">Asiento(s):</span> {lastVerification.boleto.asientos}</p>
                </div>
              )}
            </div>
            <p className="text-green-600">El pasajero puede abordar</p>
          </div>
        );
      
      case VERIFICATION_STATUS.USED:
        return (
          <div className="text-center p-8 bg-yellow-50 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-yellow-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-xl font-semibold text-yellow-800 mb-4">¡Boleto Ya Utilizado!</h2>
            <div className="px-4 py-2 bg-white rounded-lg shadow-sm mb-4">
              <p className="font-medium">Código: {lastScannedCode}</p>
              {lastVerification?.boleto && (
                <div className="mt-2 text-sm text-left">
                  <p><span className="font-medium">Ruta:</span> {lastVerification.boleto.origen} → {lastVerification.boleto.destino}</p>
                  <p><span className="font-medium">Fecha:</span> {new Date(lastVerification.boleto.fecha_viaje).toLocaleDateString()}</p>
                  <p><span className="font-medium">Hora:</span> {lastVerification.boleto.hora_salida}</p>
                  <p><span className="font-medium">Utilizado:</span> {lastVerification.boleto.fecha_uso ? new Date(lastVerification.boleto.fecha_uso).toLocaleString() : 'Desconocido'}</p>
                </div>
              )}
            </div>
            <p className="text-yellow-600">Este boleto ya ha sido utilizado anteriormente</p>
          </div>
        );
      
      case VERIFICATION_STATUS.EXPIRED:
        return (
          <div className="text-center p-8 bg-red-50 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-semibold text-red-800 mb-4">¡Boleto Caducado!</h2>
            <div className="px-4 py-2 bg-white rounded-lg shadow-sm mb-4">
              <p className="font-medium">Código: {lastScannedCode}</p>
              {lastVerification?.boleto && (
                <div className="mt-2 text-sm text-left">
                  <p><span className="font-medium">Ruta:</span> {lastVerification.boleto.origen} → {lastVerification.boleto.destino}</p>
                  <p><span className="font-medium">Fecha:</span> {new Date(lastVerification.boleto.fecha_viaje).toLocaleDateString()}</p>
                  <p><span className="font-medium">Hora:</span> {lastVerification.boleto.hora_salida}</p>
                </div>
              )}
            </div>
            <p className="text-red-600">La fecha del viaje ya pasó</p>
          </div>
        );
      
      case VERIFICATION_STATUS.INVALID:
        return (
          <div className="text-center p-8 bg-red-50 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <h2 className="text-xl font-semibold text-red-800 mb-4">¡Boleto Inválido!</h2>
            <p className="font-medium">Código: {lastScannedCode}</p>
            <p className="text-red-600 mt-2">Este código no corresponde a un boleto válido</p>
          </div>
        );
      
      case VERIFICATION_STATUS.ERROR:
        return (
          <div className="text-center p-8 bg-gray-50 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Error de Verificación</h2>
            <p className="font-medium">Código: {lastScannedCode}</p>
            <p className="text-gray-600 mt-2">Ocurrió un error al verificar este boleto</p>
          </div>
        );
      
      default:
        return null;
    }
  };

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
        <title>Verificador de Boletos | TransportApp Ecuador</title>
      </Head>
      
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="p-4 bg-primary text-white flex justify-between items-center">
            <h1 className="text-xl font-bold">Verificador de Boletos</h1>
            <div>
              <button 
                onClick={() => setShowScannerTest(!showScannerTest)}
                className="text-sm py-1 px-3 rounded bg-white bg-opacity-20 hover:bg-opacity-30 transition-colors"
              >
                {showScannerTest ? "Cerrar prueba" : "Probar lector"}
              </button>
            </div>
          </div>
          
          {/* Panel de prueba del lector */}
          {showScannerTest && (
            <div className="bg-gray-50 p-4 border-b">
              <h3 className="font-medium mb-2">Prueba del lector de códigos</h3>
              <p className="text-sm text-gray-600 mb-2">Escanea cualquier código para verificar la conexión del lector</p>
              <div className="bg-white p-3 border rounded">
                <p className="text-sm text-gray-700">Último código escaneado:</p>
                <p className="font-mono text-lg mt-1">{scannerTest || "Ningún código escaneado aún"}</p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Si aparece el código escaneado, tu lector está funcionando correctamente.
              </p>
            </div>
          )}
          
          <div className="p-6">
            {/* Status Display */}
            <div className="mb-8">
              {renderStatus()}
            </div>
            
            {/* Manual Verification Form */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Verificación Manual</h3>
              <form onSubmit={handleManualVerify} className="flex space-x-4">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Ingresa el código del boleto"
                  className="flex-1 p-2 border border-gray-300 rounded"
                  disabled={isProcessing}
                />
                <button
                  type="submit"
                  disabled={!manualCode.trim() || isProcessing}
                  className="bg-primary text-white px-4 py-2 rounded hover:bg-opacity-90 disabled:opacity-50"
                >
                  Verificar
                </button>
              </form>
            </div>
            
            {/* Recent Verifications */}
            {historial.length > 0 && (
              <div className="mt-8 border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Verificaciones Recientes</h3>
                <div className="divide-y">
                  {historial.map((item, index) => (
                    <div key={index} className="py-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium">{item.code}</span>
                          <p className="text-sm text-gray-600">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                        <div>
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                            item.status === 'VALID' ? 'bg-green-100 text-green-800' :
                            item.status === 'USED' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {item.status === 'VALID' ? 'Válido' :
                             item.status === 'USED' ? 'Usado' :
                             item.status === 'EXPIRED' ? 'Caducado' : 'Inválido'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Instructions */}
            <div className="mt-8 border-t pt-6">
              <h3 className="text-lg font-semibold mb-2">Instrucciones</h3>
              <div className="bg-blue-50 p-4 rounded-lg">
                <ol className="list-decimal list-inside text-sm text-blue-800 space-y-2">
                  <li>Conecta el lector Zymbol LI2208 a un puerto USB del equipo.</li>
                  <li>Asegúrate que el lector está configurado para enviar un Enter después de cada código.</li>
                  <li>Si deseas comprobar la conexión, usa el botón &quot;Probar lector&quot;.</li>
                  <li>Mantén esta página abierta y en foco durante la verificación de boletos.</li>
                  <li>Escanea el código QR o de barras del boleto.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
        
        <div className="text-center mb-6">
          <Link href="/" className="text-primary hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
      
      {/* Hidden input for barcode reader */}
      <input
        type="text"
        ref={inputRef}
        className="opacity-0 absolute top-0 left-0 w-1 h-1 p-0 m-0"
        autoFocus
      />
      
      {/* Audio elements for feedback */}
      <audio ref={audioSuccessRef} src="/sounds/success.mp3" preload="auto"></audio>
      <audio ref={audioErrorRef} src="/sounds/error.mp3" preload="auto"></audio>
      <audio ref={audioWarningRef} src="/sounds/warning.mp3" preload="auto"></audio>
    </>
  );
}