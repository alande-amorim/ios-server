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

// Implementação simplificada de SHA-1 para WebSocket handshake
const sha1 = (str: string): string => {
  const rotateLeft = (n: number, s: number) => (n << s) | (n >>> (32 - s));

  const cvtHex = (val: number): string => {
    let str = '';
    for (let i = 7; i >= 0; i--) {
      const v = (val >>> (i * 4)) & 0x0f;
      str += v.toString(16);
    }
    return str;
  };

  let blockstart;
  let i;
  const W = new Array(80);
  let H0 = 0x67452301;
  let H1 = 0xefcdab89;
  let H2 = 0x98badcfe;
  let H3 = 0x10325476;
  let H4 = 0xc3d2e1f0;
  let A, B, C, D, E;
  let temp;

  const strLen = str.length;
  const wordArray = [];
  for (i = 0; i < strLen - 3; i += 4) {
    wordArray.push(
      (str.charCodeAt(i) << 24) |
        (str.charCodeAt(i + 1) << 16) |
        (str.charCodeAt(i + 2) << 8) |
        str.charCodeAt(i + 3),
    );
  }

  switch (strLen % 4) {
    case 0:
      i = 0x080000000;
      break;
    case 1:
      i = (str.charCodeAt(strLen - 1) << 24) | 0x0800000;
      break;
    case 2:
      i =
        (str.charCodeAt(strLen - 2) << 24) |
        (str.charCodeAt(strLen - 1) << 16) |
        0x08000;
      break;
    case 3:
      i =
        (str.charCodeAt(strLen - 3) << 24) |
        (str.charCodeAt(strLen - 2) << 16) |
        (str.charCodeAt(strLen - 1) << 8) |
        0x80;
      break;
  }

  wordArray.push(i);

  while (wordArray.length % 16 !== 14) {
    wordArray.push(0);
  }

  wordArray.push(strLen >>> 29);
  wordArray.push((strLen << 3) & 0x0ffffffff);

  for (blockstart = 0; blockstart < wordArray.length; blockstart += 16) {
    for (i = 0; i < 16; i++) {
      W[i] = wordArray[blockstart + i];
    }
    for (i = 16; i <= 79; i++) {
      W[i] = rotateLeft(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
    }

    A = H0;
    B = H1;
    C = H2;
    D = H3;
    E = H4;

    for (i = 0; i <= 19; i++) {
      temp =
        (rotateLeft(A, 5) + ((B & C) | (~B & D)) + E + W[i] + 0x5a827999) &
        0x0ffffffff;
      E = D;
      D = C;
      C = rotateLeft(B, 30);
      B = A;
      A = temp;
    }

    for (i = 20; i <= 39; i++) {
      temp =
        (rotateLeft(A, 5) + (B ^ C ^ D) + E + W[i] + 0x6ed9eba1) & 0x0ffffffff;
      E = D;
      D = C;
      C = rotateLeft(B, 30);
      B = A;
      A = temp;
    }

    for (i = 40; i <= 59; i++) {
      temp =
        (rotateLeft(A, 5) +
          ((B & C) | (B & D) | (C & D)) +
          E +
          W[i] +
          0x8f1bbcdc) &
        0x0ffffffff;
      E = D;
      D = C;
      C = rotateLeft(B, 30);
      B = A;
      A = temp;
    }

    for (i = 60; i <= 79; i++) {
      temp =
        (rotateLeft(A, 5) + (B ^ C ^ D) + E + W[i] + 0xca62c1d6) & 0x0ffffffff;
      E = D;
      D = C;
      C = rotateLeft(B, 30);
      B = A;
      A = temp;
    }

    H0 = (H0 + A) & 0x0ffffffff;
    H1 = (H1 + B) & 0x0ffffffff;
    H2 = (H2 + C) & 0x0ffffffff;
    H3 = (H3 + D) & 0x0ffffffff;
    H4 = (H4 + E) & 0x0ffffffff;
  }

  return cvtHex(H0) + cvtHex(H1) + cvtHex(H2) + cvtHex(H3) + cvtHex(H4);
};

const createWebSocketAccept = (key: string): string => {
  const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const combined = key + magic;
  const hash = sha1(combined);

  // Converter hex para bytes e depois para base64
  const bytes = [];
  for (let i = 0; i < hash.length; i += 2) {
    bytes.push(parseInt(hash.substr(i, 2), 16));
  }

  return Buffer.from(bytes).toString('base64');
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
          '',
          '',
        ].join('\r\n');

        socket.write(response);
        return true;
      }
    }

    return false;
  };

  const decodeWebSocketFrame = (
    buffer: Buffer,
  ): {
    type: 'text' | 'ping' | 'pong' | 'close';
    data: string | null;
  } | null => {
    if (buffer.length < 2) return null;

    const firstByte = buffer[0];
    const secondByte = buffer[1];

    const fin = (firstByte & 0x80) === 0x80;
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;

    if (!fin) return null; // Só aceita frames completos

    let offset = 2;

    if (payloadLength === 126) {
      if (buffer.length < 4) return null;
      payloadLength = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLength === 127) {
      // Para simplicidade, não suporta payloads muito grandes
      return null;
    }

    let maskKey: Buffer | null = null;
    if (masked) {
      if (buffer.length < offset + 4) return null;
      maskKey = buffer.slice(offset, offset + 4);
      offset += 4;
    }

    if (buffer.length < offset + payloadLength) return null;

    const payload = buffer.slice(offset, offset + payloadLength);

    if (masked && maskKey) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }

    // Determinar tipo de frame
    switch (opcode) {
      case 0x01: // Text frame
        return { type: 'text', data: payload.toString('utf8') };
      case 0x08: // Close frame
        return { type: 'close', data: null };
      case 0x09: // Ping frame
        return { type: 'ping', data: payload.toString('utf8') };
      case 0x0a: // Pong frame
        return { type: 'pong', data: payload.toString('utf8') };
      default:
        return null;
    }
  };

  const encodeWebSocketFrame = (
    text: string,
    opcode: number = 0x01,
  ): Buffer => {
    const payload = Buffer.from(text, 'utf8');
    const payloadLength = payload.length;

    let frame: Buffer;

    if (payloadLength < 126) {
      frame = Buffer.allocUnsafe(2 + payloadLength);
      frame[0] = 0x80 | opcode; // FIN + opcode
      frame[1] = payloadLength;
      payload.copy(frame, 2);
    } else if (payloadLength < 65536) {
      frame = Buffer.allocUnsafe(4 + payloadLength);
      frame[0] = 0x80 | opcode;
      frame[1] = 126;
      frame.writeUInt16BE(payloadLength, 2);
      payload.copy(frame, 4);
    } else {
      // Para simplicidade, não suporta payloads muito grandes
      frame = Buffer.allocUnsafe(2);
      frame[0] = 0x80 | opcode;
      frame[1] = 0;
    }

    return frame;
  };

  const createPingFrame = (): Buffer => {
    return encodeWebSocketFrame('', 0x09); // Ping frame
  };

  const createPongFrame = (data: string = ''): Buffer => {
    return encodeWebSocketFrame(data, 0x0a); // Pong frame
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
          isWebSocket: false,
        };

        clientsRef.current.set(clientId, socket);
        setClients(prev => [...prev, clientInfo]);

        // Ping interval para manter conexão WebSocket ativa
        let pingInterval: NodeJS.Timeout | null = null;

        socket.on('data', (data: Buffer) => {
          try {
            if (!handshakeComplete) {
              // Tentar handshake WebSocket
              if (handleWebSocketHandshake(socket, data)) {
                isWebSocketClient = true;
                handshakeComplete = true;
                clientInfo.isWebSocket = true;
                console.log(`Cliente ${clientId} conectado via WebSocket`);

                // Iniciar ping para manter conexão ativa
                pingInterval = setInterval(() => {
                  if (socket.readyState !== 'closed') {
                    socket.write(createPingFrame());
                  }
                }, 30000); // Ping a cada 30 segundos

                return;
              } else {
                // Cliente TCP puro
                handshakeComplete = true;
                console.log(`Cliente ${clientId} conectado via TCP`);
              }
            }

            if (isWebSocketClient) {
              // Decodificar frame WebSocket
              const decoded = decodeWebSocketFrame(data);
              if (!decoded) return;

              switch (decoded.type) {
                case 'ping':
                  // Responder com pong
                  socket.write(createPongFrame(decoded.data || ''));
                  return;

                case 'pong':
                  // Cliente respondeu ao ping - conexão está ativa
                  console.log(`Cliente ${clientId} respondeu ao ping`);
                  return;

                case 'close':
                  // Cliente quer fechar conexão
                  console.log(`Cliente ${clientId} solicitou fechamento`);
                  socket.destroy();
                  return;

                case 'text':
                  if (!decoded.data) return;

                  try {
                    const message: WebRTCMessage = JSON.parse(decoded.data);
                    console.log('Mensagem WebSocket recebida:', message);

                    // Repassar mensagem para outros clientes
                    clientsRef.current.forEach((clientSocket, id) => {
                      if (
                        id !== clientId &&
                        clientSocket.readyState !== 'closed'
                      ) {
                        const messageWithSender = {
                          ...message,
                          from: clientId,
                        };
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
                  } catch (parseErr) {
                    console.error(
                      'Erro ao fazer parse da mensagem WebSocket:',
                      parseErr,
                    );
                  }
                  break;
              }
            } else {
              // Cliente TCP puro
              const messageText = data.toString();

              try {
                const message: WebRTCMessage = JSON.parse(messageText);
                console.log('Mensagem TCP recebida:', message);

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
              } catch (parseErr) {
                console.error('Erro ao fazer parse da mensagem TCP:', parseErr);
              }
            }
          } catch (err) {
            console.error('Erro ao processar mensagem:', err);
          }
        });

        socket.on('close', () => {
          console.log(`Cliente desconectado: ${clientId}`);
          if (pingInterval) {
            clearInterval(pingInterval);
          }
          clientsRef.current.delete(clientId);
          setClients(prev => prev.filter(client => client.id !== clientId));
        });

        socket.on('error', (err: any) => {
          console.error(`Erro no cliente ${clientId}:`, err);
          if (pingInterval) {
            clearInterval(pingInterval);
          }
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
          const frame = encodeWebSocketFrame(messageStr, 0x01); // Text frame
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
