import { useEffect, useState, useRef } from 'react';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';

interface SocketClient {
  id: string;
  socket: any;
  isWebSocket: boolean;
}

interface WebRTCMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave';
  data?: any;
  from?: string;
  to?: string;
}

// Função para gerar chave WebSocket (não usada, mas mantida para referência)
// const generateWebSocketKey = (): string => {
//   const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
//   let result = '';
//   for (let i = 0; i < 22; i++) {
//     result += chars.charAt(Math.floor(Math.random() * chars.length));
//   }
//   return result + '==';
// };

// Função para criar hash SHA-1 simples (para WebSocket handshake)
const createWebSocketAccept = (key: string): string => {
  // Implementação simplificada - em produção use uma biblioteca crypto
  const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const combined = key + magic;
  
  // Hash SHA-1 simples (não é seguro para produção real)
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Converter para base64 (simulado)
  return Buffer.from(hash.toString()).toString('base64');
};

export const useSocketServer = (port: number) => {
  const [isRunning, setIsRunning] = useState(false);
  const [clients, setClients] = useState<SocketClient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const serverRef = useRef<any>(null);
  const clientsRef = useRef<Map<string, any>>(new Map());

  const handleWebSocketHandshake = (socket: any, data: Buffer): boolean => {
    const request = data.toString();
    
    if (request.includes('GET') && request.includes('Upgrade: websocket')) {
      const lines = request.split('\r\n');
      let webSocketKey = '';
      
      for (const line of lines) {
        if (line.startsWith('Sec-WebSocket-Key:')) {
          webSocketKey = line.split(':')[1].trim();
          break;
        }
      }
      
      if (webSocketKey) {
        const acceptKey = createWebSocketAccept(webSocketKey);
        
        const response = [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${acceptKey}`,
          'Sec-WebSocket-Protocol: chat',
          '',
          ''
        ].join('\r\n');
        
        socket.write(response);
        return true;
      }
    }
    
    return false;
  };

  const decodeWebSocketFrame = (buffer: Buffer): string | null => {
    if (buffer.length < 2) return null;
    
    const firstByte = buffer[0];
    const secondByte = buffer[1];
    
    const fin = (firstByte & 0x80) === 0x80;
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;
    
    if (!fin || opcode !== 0x01) return null; // Só aceita texto completo
    
    let offset = 2;
    
    if (payloadLength === 126) {
      payloadLength = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      // Para simplicidade, não suporta payloads muito grandes
      return null;
    }
    
    let maskKey: Buffer | null = null;
    if (masked) {
      maskKey = buffer.slice(offset, offset + 4);
      offset += 4;
    }
    
    const payload = buffer.slice(offset, offset + payloadLength);
    
    if (masked && maskKey) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }
    
    return payload.toString('utf8');
  };

  const encodeWebSocketFrame = (text: string): Buffer => {
    const payload = Buffer.from(text, 'utf8');
    const payloadLength = payload.length;
    
    let frame: Buffer;
    
    if (payloadLength < 126) {
      frame = Buffer.allocUnsafe(2 + payloadLength);
      frame[0] = 0x81; // FIN + text frame
      frame[1] = payloadLength;
      payload.copy(frame, 2);
    } else if (payloadLength < 65536) {
      frame = Buffer.allocUnsafe(4 + payloadLength);
      frame[0] = 0x81;
      frame[1] = 126;
      frame.writeUInt16BE(payloadLength, 2);
      payload.copy(frame, 4);
    } else {
      // Para simplicidade, não suporta payloads muito grandes
      frame = Buffer.allocUnsafe(2);
      frame[0] = 0x81;
      frame[1] = 0;
    }
    
    return frame;
  };

  const startServer = () => {
    try {
      const server: any = TcpSocket.createServer((socket: any) => {
        const clientId = `client_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        
        console.log(`Cliente conectado: ${clientId}`);
        
        let isWebSocketClient = false;
        let handshakeComplete = false;
        
        const clientInfo: SocketClient = {
          id: clientId,
          socket,
          isWebSocket: false
        };
        
        clientsRef.current.set(clientId, socket);
        setClients(prev => [...prev, clientInfo]);

        socket.on('data', (data: Buffer) => {
          try {
            if (!handshakeComplete) {
              // Tentar handshake WebSocket
              if (handleWebSocketHandshake(socket, data)) {
                isWebSocketClient = true;
                handshakeComplete = true;
                clientInfo.isWebSocket = true;
                console.log(`Cliente ${clientId} conectado via WebSocket`);
                return;
              } else {
                // Cliente TCP puro
                handshakeComplete = true;
                console.log(`Cliente ${clientId} conectado via TCP`);
              }
            }
            
            let messageText: string;
            
            if (isWebSocketClient) {
              // Decodificar frame WebSocket
              const decoded = decodeWebSocketFrame(data);
              if (!decoded) return;
              messageText = decoded;
            } else {
              // TCP puro
              messageText = data.toString();
            }
            
            const message: WebRTCMessage = JSON.parse(messageText);
            console.log('Mensagem recebida:', message);
            
            // Repassar mensagem para outros clientes
            clientsRef.current.forEach((clientSocket, id) => {
              if (id !== clientId && clientSocket.readyState !== 'closed') {
                const messageWithSender = { ...message, from: clientId };
                const messageStr = JSON.stringify(messageWithSender);
                
                // Verificar se o cliente de destino é WebSocket
                const targetClient = clients.find(c => c.id === id);
                if (targetClient?.isWebSocket) {
                  // Enviar como frame WebSocket
                  const frame = encodeWebSocketFrame(messageStr);
                  clientSocket.write(frame);
                } else {
                  // Enviar como TCP puro
                  clientSocket.write(messageStr);
                }
              }
            });
          } catch (err) {
            console.error('Erro ao processar mensagem:', err);
          }
        });

        socket.on('close', () => {
          console.log(`Cliente desconectado: ${clientId}`);
          clientsRef.current.delete(clientId);
          setClients(prev => prev.filter(client => client.id !== clientId));
        });

        socket.on('error', (err: any) => {
          console.error(`Erro no cliente ${clientId}:`, err);
          clientsRef.current.delete(clientId);
          setClients(prev => prev.filter(client => client.id !== clientId));
        });
      });

      server.listen({ port, host: '0.0.0.0' }, () => {
        console.log(`Servidor WebSocket/TCP rodando na porta ${port}`);
        setIsRunning(true);
        setError(null);
      });

      server.on('error', (err: any) => {
        console.error('Erro no servidor:', err);
        setError(`Erro no servidor: ${err.message}`);
        setIsRunning(false);
      });

      serverRef.current = server;
    } catch (err: any) {
      console.error('Erro ao iniciar servidor:', err);
      setError(`Erro ao iniciar: ${err.message}`);
    }
  };

  const stopServer = () => {
    if (serverRef.current) {
      clientsRef.current.forEach(socket => {
        socket.destroy();
      });
      clientsRef.current.clear();

      serverRef.current.close();
      serverRef.current = null;

      setIsRunning(false);
      setClients([]);
      console.log('Servidor WebSocket/TCP parado');
    }
  };

  const broadcastMessage = (message: WebRTCMessage) => {
    const messageStr = JSON.stringify(message);
    
    clientsRef.current.forEach(socket => {
      if (socket.readyState !== 'closed') {
        // Encontrar info do cliente para saber se é WebSocket
        const clientInfo = clients.find(c => c.socket === socket);
        
        if (clientInfo?.isWebSocket) {
          const frame = encodeWebSocketFrame(messageStr);
          socket.write(frame);
        } else {
          socket.write(messageStr);
        }
      }
    });
  };

  useEffect(() => {
    return () => {
      stopServer();
    };
  }, []);

  return {
    isRunning,
    clients,
    error,
    startServer,
    stopServer,
    broadcastMessage,
    clientCount: clients.length,
  };
};