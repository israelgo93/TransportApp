///home/phiuser/phi/transporte-app/lib/placeToPay.js
import axios from 'axios';
import crypto from 'crypto';

/**
 * Clase para PlaceToPay Ecuador según documentación específica
 */
class PlaceToPay {
  constructor() {
    // Eliminar /api de la URL según la documentación
    const baseUrl = process.env.PLACE_TO_PAY_URL || 'https://checkout-test.placetopay.ec';
    this.url = baseUrl.replace(/\/api$/, '');
    this.login = process.env.PLACE_TO_PAY_LOGIN;
    this.secretKey = process.env.PLACE_TO_PAY_KEY; // Corregido para usar PLACE_TO_PAY_KEY
    
    if (!this.login || !this.secretKey) {
      throw new Error('Configuración de PlaceToPay incompleta. Verifica las variables de entorno.');
    }
    
    console.log('PlaceToPay inicializado con:', {
      url: this.url,
      login_sample: this.login.substring(0, 5) + '...'
    });
  }

  /**
   * Genera los datos de autenticación según documentación de PlaceToPay Ecuador
   */
  getAuth() {
    // Genera un valor aleatorio para el nonce (sin codificar)
    const rawNonce = Math.floor(Math.random() * 1000000000).toString();
    
    // Fecha actual en formato ISO 8601
    const seed = new Date().toISOString();
    
    // Exactamente como en el ejemplo PHP de la documentación
    // $tranKey = base64_encode(hash('sha256', $rawNonce.$seed.$secretKey, true));
    const tranKey = Buffer.from(
      crypto.createHash('sha256')
            .update(rawNonce + seed + this.secretKey)
            .digest()
    ).toString('base64');
    
    // Codifica el nonce en base64
    const nonce = Buffer.from(rawNonce).toString('base64');
    
    console.log('Auth generada:', {
      login_sample: this.login.substring(0, 5) + '...',
      rawNonce: rawNonce, // Esto es crítico para depuración
      seed: seed,
      secretKey_length: this.secretKey.length,
      tranKey_sample: tranKey.substring(0, 10) + '...',
      nonce_sample: nonce.substring(0, 10) + '...'
    });
    
    return {
      login: this.login,
      tranKey: tranKey,
      nonce: nonce,
      seed: seed
    };
  }

  /**
   * Crea una sesión de pago
   */
  async createSession(data) {
    try {
      // Validar datos mínimos
      if (!data.reference || !data.description || !data.amount || !data.returnUrl) {
        throw new Error('Datos incompletos para crear sesión de pago');
      }

      // Generar datos para la solicitud
      const payload = {
        auth: this.getAuth(),
        locale: 'es_EC', // Específico para Ecuador
        payment: {
          reference: data.reference,
          description: data.description,
          amount: {
            currency: data.currency || 'USD',
            total: data.amount
          }
        },
        expiration: data.expiration || new Date(Date.now() + (data.expirationMinutes || 60) * 60 * 1000).toISOString(),
        returnUrl: data.returnUrl,
        ipAddress: data.ipAddress || '127.0.0.1',
        userAgent: data.userAgent || 'Mozilla/5.0',
      };

      // Añadir URL de notificación si está presente
      if (data.notificationUrl) {
        payload.notificationUrl = data.notificationUrl;
        console.log(`Configurando notificationUrl: ${data.notificationUrl}`);
      }

      // Agregar información del comprador
      if (data.buyerEmail) {
        payload.buyer = {
          email: data.buyerEmail,
          name: data.buyerName || 'Cliente',
          surname: data.buyerSurname || 'Web',
          documentType: data.buyerDocumentType || 'CI',  // CI es el tipo de documento por defecto para Ecuador
          document: data.buyerDocument || '0000000000',
          mobile: data.buyerMobile || '0000000000'
        };
      }

      // URL completa con /api/session
      const url = `${this.url}/api/session`;
      
      console.log('Request PlaceToPay:', {
        url: url,
        auth: {
          login: payload.auth.login.substring(0, 5) + '...',
          tranKey: payload.auth.tranKey.substring(0, 10) + '...',
          nonce: payload.auth.nonce.substring(0, 10) + '...',
          seed: payload.auth.seed
        },
        locale: payload.locale,
        reference: payload.payment.reference,
        amount: payload.payment.amount.total,
        currency: payload.payment.amount.currency,
        returnUrl: payload.returnUrl,
        notificationUrl: payload.notificationUrl || 'No configurada'
      });

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000 // Aumentado a 15 segundos de timeout
      });

      console.log('Respuesta PlaceToPay:', {
        status: response.data.status,
        requestId: response.data.requestId,
        processUrl: response.data.processUrl ? '(URL generada)' : 'No disponible'
      });

      return response.data;
    } catch (error) {
      console.error('Error PlaceToPay:', error.message);
      
      if (error.response) {
        console.error('Detalles del error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      
      throw error;
    }
  }

  /**
   * Consulta el estado de una sesión
   */
  async getSessionStatus(requestId) {
    try {
      console.log(`Consultando estado de sesión ${requestId} en PlaceToPay`);
      
      // Asegurar que requestId es un string
      const reqId = String(requestId);
      
      const response = await axios.post(`${this.url}/api/session/${reqId}`, {
        auth: this.getAuth()
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000 // Aumentado a 15 segundos
      });
      
      console.log(`Respuesta status de sesión ${reqId}:`, {
        status: response.data.status?.status || 'Unknown',
        reason: response.data.status?.reason || 'N/A'
      });
      
      return response.data;
    } catch (error) {
      console.error('Error al consultar estado:', error.message);
      
      if (error.response) {
        console.error('Detalles del error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      
      throw error;
    }
  }
  
  /**
   * Valida la firma de una notificación de PlaceToPay
   * La firma se genera con SHA-1(requestId + status.status + status.date + secretKey)
   */
  verifySignature(notification) {
    try {
      if (!notification || !notification.requestId || !notification.status || !notification.signature) {
        console.error('Notificación inválida, faltan datos requeridos');
        return false;
      }
      
      // Convertir requestId a string si es necesario
      const reqId = String(notification.requestId);
      
      // Generar signature local según la documentación
      const calculatedSignature = crypto.createHash('sha1')
        .update(reqId + notification.status.status + notification.status.date + this.secretKey)
        .digest('hex');
      
      console.log('Verificación de firma:', {
        received: notification.signature,
        calculated: calculatedSignature,
        match: notification.signature === calculatedSignature
      });
      
      return notification.signature === calculatedSignature;
    } catch (error) {
      console.error('Error al verificar firma:', error);
      return false;
    }
  }
}

// Instancia global
const placeToPay = new PlaceToPay();

// Función para crear una nueva sesión de pago
export const createPaymentSession = async (paymentData) => {
  try {
    return await placeToPay.createSession(paymentData);
  } catch (error) {
    console.error('Error creating payment session:', error.message);
    throw error;
  }
};

// Función para consultar el estado de una sesión de pago
export const getPaymentStatus = async (requestId) => {
  try {
    return await placeToPay.getSessionStatus(requestId);
  } catch (error) {
    console.error('Error getting payment status:', error.message);
    throw error;
  }
};

// Función para verificar la firma de una notificación
export const verifyNotificationSignature = (notification) => {
  return placeToPay.verifySignature(notification);
};