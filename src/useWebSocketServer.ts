import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import CryptoJS from 'crypto-js';
import { useNetInfoInstance } from '@react-native-community/netinfo';

// Interface pública - só WebSocket é exposto
interface WebSocketMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave' | string;
  data?: any;
  from?: string;
}

interface WebSocketClient {
  id: string;
  connectedAt: Date;
}

// Implementação interna do protocolo WebSocket sobre TCP (abstraída)
class SimpleWebSocketServer {
  private server: any = null;
  private clients = new Map<string, any>();
  private onConnection?: (clientId: string) => void;
  private onMessage?: (clientId: string, message: WebSocketMessage) => void;
  private onDisconnection?: (clientId: string) => void;
  private onError?: (error: string) => void;

  // SHA-1 para handshake WebSocket (RFC 6455)
  private sha1(str: string): string {
    const rotateLeft = (n: number, s: number) => (n << s) | (n >>> (32 - s));

    let H0 = 0x67452301,
      H1 = 0xefcdab89,
      H2 = 0x98badcfe,
      H3 = 0x10325476,
      H4 = 0xc3d2e1f0;
    const words = [];

    for (let i = 0; i < str.length - 3; i += 4) {
      words.push(
        (str.charCodeAt(i) << 24) |
          (str.charCodeAt(i + 1) << 16) |
          (str.charCodeAt(i + 2) << 8) |
          str.charCodeAt(i + 3),
      );
    }

    let i = 0x80000000;
    switch (str.length % 4) {
      case 1:
        i = (str.charCodeAt(str.length - 1) << 24) | 0x800000;
        break;
      case 2:
        i =
          (str.charCodeAt(str.length - 2) << 24) |
          (str.charCodeAt(str.length - 1) << 16) |
          0x8000;
        break;
      case 3:
        i =
          (str.charCodeAt(str.length - 3) << 24) |
          (str.charCodeAt(str.length - 2) << 16) |
          (str.charCodeAt(str.length - 1) << 8) |
          0x80;
        break;
    }
    words.push(i);

    while (words.length % 16 !== 14) words.push(0);
    words.push(str.length >>> 29, (str.length << 3) & 0xffffffff);

    for (let chunk = 0; chunk < words.length; chunk += 16) {
      const W = words.slice(chunk, chunk + 16);
      for (let i = 16; i < 80; i++) {
        W[i] = rotateLeft(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
      }

      let A = H0,
        B = H1,
        C = H2,
        D = H3,
        E = H4;

      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) {
          f = (B & C) | (~B & D);
          k = 0x5a827999;
        } else if (i < 40) {
          f = B ^ C ^ D;
          k = 0x6ed9eba1;
        } else if (i < 60) {
          f = (B & C) | (B & D) | (C & D);
          k = 0x8f1bbcdc;
        } else {
          f = B ^ C ^ D;
          k = 0xca62c1d6;
        }

        const temp = (rotateLeft(A, 5) + f + E + W[i] + k) & 0xffffffff;
        E = D;
        D = C;
        C = rotateLeft(B, 30);
        B = A;
        A = temp;
      }

      H0 = (H0 + A) & 0xffffffff;
      H1 = (H1 + B) & 0xffffffff;
      H2 = (H2 + C) & 0xffffffff;
      H3 = (H3 + D) & 0xffffffff;
      H4 = (H4 + E) & 0xffffffff;
    }

    return [H0, H1, H2, H3, H4]
      .map(h => h.toString(16).padStart(8, '0'))
      .join('');
  }

  private createWebSocketAccept(key: string): string {
    const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const combined = key + magic;
    console.log('🔗 Combined string:', combined);

    // Usar crypto-js para SHA-1 confiável
    const hash = CryptoJS.SHA1(combined);
    const result = CryptoJS.enc.Base64.stringify(hash);

    console.log('🎯 Final accept key:', result);
    return result;
  }

  private handleHandshake(socket: any, data: Buffer): boolean {
    const request = data.toString();
    console.log('🔍 Request completo:', request);

    // Verificar se é request WebSocket
    if (!request.includes('GET ') || !request.includes('Upgrade: websocket')) {
      console.log('❌ Não é request WebSocket válido');
      return false;
    }

    // Extrair chave WebSocket
    const keyMatch = request.match(/Sec-WebSocket-Key:\s*(.+)\r?\n/i);
    if (!keyMatch) {
      console.log('❌ Sec-WebSocket-Key não encontrada');
      return false;
    }

    const webSocketKey = keyMatch[1].trim();
    console.log('🔑 WebSocket Key:', webSocketKey);

    const acceptKey = this.createWebSocketAccept(webSocketKey);
    console.log('🔑 Accept Key:', acceptKey);

    const response = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n');

    console.log('📤 Enviando response:', response);
    socket.write(response);
    return true;
  }

  private decodeFrame(
    buffer: Buffer,
  ): { type: 'text' | 'ping' | 'pong' | 'close'; data: string } | null {
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
      if (buffer.length < 10) return null;
      // Ignorar high 32 bits (assumir que payload < 4GB)
      payloadLength = buffer.readUInt32BE(offset + 4);
      offset += 8;
    }

    if (buffer.length < offset + (masked ? 4 : 0) + payloadLength) return null;

    let payload: Buffer;

    if (masked) {
      const mask = buffer.slice(offset, offset + 4);
      payload = buffer.slice(offset + 4, offset + 4 + payloadLength);

      // Aplicar máscara
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }
    } else {
      payload = buffer.slice(offset, offset + payloadLength);
    }

    const types: { [key: number]: 'text' | 'close' | 'ping' | 'pong' } = {
      0x01: 'text',
      0x08: 'close',
      0x09: 'ping',
      0x0a: 'pong',
    };

    return {
      type: types[opcode] || 'text',
      data: payload.toString('utf8'),
    };
  }

  private encodeFrame(text: string, opcode: number = 0x01): Buffer {
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;

    let frame: Buffer;
    if (len < 126) {
      frame = Buffer.alloc(2 + len);
      frame[0] = 0x80 | opcode; // FIN=1, RSV=000, opcode
      frame[1] = len; // MASK=0, payload length
      payload.copy(frame, 2);
    } else if (len < 65536) {
      frame = Buffer.alloc(4 + len);
      frame[0] = 0x80 | opcode;
      frame[1] = 126;
      frame.writeUInt16BE(len, 2);
      payload.copy(frame, 4);
    } else {
      frame = Buffer.alloc(10 + len);
      frame[0] = 0x80 | opcode;
      frame[1] = 127;
      frame.writeUInt32BE(0, 2); // High 32 bits (sempre 0 para payloads < 4GB)
      frame.writeUInt32BE(len, 6); // Low 32 bits
      payload.copy(frame, 10);
    }
    return frame;
  }

  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = TcpSocket.createServer((socket: any) => {
          const clientId = `ws_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 6)}`;
          let isWebSocket = false;

          socket.on('data', (data: Buffer) => {
            if (!isWebSocket) {
              console.log(
                `🤝 Tentando handshake com ${clientId}, dados:`,
                data.toString().substring(0, 200),
              );
              if (this.handleHandshake(socket, data)) {
                isWebSocket = true;
                this.clients.set(clientId, socket);
                console.log(`✅ Handshake completo para ${clientId}`);
                this.onConnection?.(clientId);

                // Ping a cada 30s para manter conexão
                const pingInterval = setInterval(() => {
                  if (socket.readyState !== 'closed') {
                    const pingFrame = this.encodeFrame('', 0x09);
                    console.log(`🏓 Enviando ping para ${clientId}`);
                    socket.write(pingFrame);
                  }
                }, 30000);

                socket.pingInterval = pingInterval;
              } else {
                console.log(`❌ Handshake falhou para ${clientId}`);
              }
              return;
            }

            console.log(
              `📦 Dados recebidos de ${clientId}:`,
              data.length,
              'bytes',
            );
            const frame = this.decodeFrame(data);
            if (!frame) {
              console.log(`❌ Frame inválido de ${clientId}`);
              return;
            }

            console.log(
              `🎭 Frame decodificado de ${clientId}:`,
              frame.type,
              frame.data.substring(0, 100),
            );

            switch (frame.type) {
              case 'ping':
                console.log(`🏓 Ping recebido de ${clientId}, enviando pong`);
                socket.write(this.encodeFrame(frame.data, 0x0a)); // Responder pong
                break;
              case 'pong':
                console.log(`🏓 Pong recebido de ${clientId}`);
                break;
              case 'close':
                console.log(`🚪 Close frame recebido de ${clientId}`);
                socket.destroy();
                break;
              case 'text':
                try {
                  const message = JSON.parse(frame.data);
                  console.log(`💬 Mensagem JSON de ${clientId}:`, message);
                  this.onMessage?.(clientId, message);
                } catch (e) {
                  console.log(`❌ JSON inválido de ${clientId}:`, frame.data);
                }
                break;
            }
          });

          socket.on('close', () => {
            if (socket.pingInterval) clearInterval(socket.pingInterval);
            this.clients.delete(clientId);
            if (isWebSocket) this.onDisconnection?.(clientId);
          });

          socket.on('error', () => {
            if (socket.pingInterval) clearInterval(socket.pingInterval);
            this.clients.delete(clientId);
            if (isWebSocket) this.onDisconnection?.(clientId);
          });
        });

        this.server.listen({ port, host: '0.0.0.0' }, () => resolve());
        this.server.on('error', (err: any) => {
          this.onError?.(err.message);
          reject(err);
        });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  stop(): void {
    if (this.server) {
      this.clients.forEach(socket => {
        if (socket.pingInterval) clearInterval(socket.pingInterval);
        socket.destroy();
      });
      this.clients.clear();
      this.server.close();
      this.server = null;
    }
  }

  broadcast(message: WebSocketMessage, excludeClientId?: string): void {
    const messageStr = JSON.stringify(message);
    const data = this.encodeFrame(messageStr);
    console.log(
      `📢 Broadcast para ${this.clients.size} clientes:`,
      messageStr.substring(0, 100),
    );

    this.clients.forEach((socket, clientId) => {
      if (clientId !== excludeClientId && socket.readyState !== 'closed') {
        console.log(`📤 Enviando para ${clientId}`);
        socket.write(data);
      } else if (clientId === excludeClientId) {
        console.log(`⏭️ Pulando remetente ${clientId}`);
      } else {
        console.log(`❌ Socket fechado para ${clientId}`);
      }
    });
  }

  sendTo(clientId: string, message: WebSocketMessage): boolean {
    const socket = this.clients.get(clientId);
    if (socket && socket.readyState !== 'closed') {
      socket.write(this.encodeFrame(JSON.stringify(message)));
      return true;
    }
    return false;
  }

  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  // Event handlers
  onClientConnect(handler: (clientId: string) => void): void {
    this.onConnection = handler;
  }

  onClientMessage(
    handler: (clientId: string, message: WebSocketMessage) => void,
  ): void {
    this.onMessage = handler;
  }

  onClientDisconnect(handler: (clientId: string) => void): void {
    this.onDisconnection = handler;
  }

  onServerError(handler: (error: string) => void): void {
    this.onError = handler;
  }
}

// Hook público - apenas WebSocket é exposto
export const useWebSocketServer = (port: number) => {
  const [isRunning, setIsRunning] = useState(false);
  const [clients, setClients] = useState<WebSocketClient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  const serverRef = useRef<SimpleWebSocketServer | null>(null);

  // Configuração estável para netInfo
  const config = useMemo(
    () => ({
      reachabilityUrl: 'https://clients3.google.com/generate_204',
      reachabilityTest: async (response: any) => response.status === 204,
      reachabilityLongTimeout: 60 * 1000, // 60s
      reachabilityShortTimeout: 5 * 1000, // 5s
      reachabilityRequestTimeout: 15 * 1000, // 15s
      reachabilityShouldRun: () => true,
      shouldFetchWiFiSSID: true, // met iOS requirements to get SSID
      useNativeReachability: false,
    }),
    [],
  );

  const { netInfo } = useNetInfoInstance(false, config);

  // Estabilizar valores do netInfo para evitar re-renders desnecessários
  const networkDetails = netInfo?.details as any;
  const networkState = useMemo(
    () => ({
      isConnected: netInfo?.isConnected || false,
      ipAddress: networkDetails?.ipAddress || null,
    }),
    [netInfo?.isConnected, networkDetails?.ipAddress],
  );

  // Monitorar conexão de rede e gerar serverUrl
  useEffect(() => {
    if (networkState.isConnected && isRunning && networkState.ipAddress) {
      setServerUrl(`ws://${networkState.ipAddress}:${port}`);
    } else {
      setServerUrl(null);
    }
  }, [networkState.isConnected, networkState.ipAddress, isRunning, port]);

  // Inicializar servidor WebSocket
  const startServer = useCallback(async () => {
    if (isRunning || serverRef.current) {
      console.log('⚠️ Servidor já está rodando, ignorando...');
      return;
    }

    try {
      console.log('🚀 Iniciando servidor WebSocket...');
      setError(null);
      const server = new SimpleWebSocketServer();

      // Event handlers
      server.onClientConnect(clientId => {
        console.log(`🔌 Cliente WebSocket conectado: ${clientId}`);
        server.sendTo(clientId, {
          type: 'welcome',
          data: 'Bem-vindo ao servidor WebSocket',
        });
        setClients(prev => [
          ...prev,
          { id: clientId, connectedAt: new Date() },
        ]);
      });

      server.onClientMessage((clientId, message) => {
        console.log(`📨 Mensagem WebSocket de ${clientId}:`, message);
        // Retransmitir para outros clientes
        const messageWithSender = { ...message, from: clientId };
        server.broadcast(messageWithSender, clientId);
      });

      server.onClientDisconnect(clientId => {
        console.log(`❌ Cliente WebSocket desconectado: ${clientId}`);
        setClients(prev => prev.filter(c => c.id !== clientId));
      });

      server.onServerError(errorMsg => {
        console.error('❌ Erro no servidor WebSocket:', errorMsg);
        setError(errorMsg);
        setIsRunning(false);
      });

      await server.start(port);
      serverRef.current = server;
      setIsRunning(true);
      console.log(`🚀 Servidor WebSocket rodando na porta ${port}`);
    } catch (err: any) {
      console.error('❌ Erro ao iniciar servidor:', err);
      setError(err?.message || 'Erro desconhecido ao iniciar servidor');
      setIsRunning(false);
    }
  }, [isRunning, port]);

  // Parar servidor
  const stopServer = useCallback(() => {
    if (serverRef.current) {
      serverRef.current.stop();
      serverRef.current = null;
      setIsRunning(false);
      setClients([]);
      setServerUrl(null);
      console.log('⏹️ Servidor WebSocket parado');
    }
  }, []);

  // Broadcast para todos os clientes
  const broadcast = (message: WebSocketMessage) => {
    serverRef.current?.broadcast(message);
  };

  // Enviar para cliente específico
  const sendToClient = (
    clientId: string,
    message: WebSocketMessage,
  ): boolean => {
    return serverRef.current?.sendTo(clientId, message) || false;
  };

  // Cleanup
  useEffect(() => {
    return () => stopServer();
  }, [stopServer]);

  return {
    // Estado
    isRunning,
    clientCount: clients.length,
    clients,
    error,
    serverUrl,
    netInfo,

    // Ações WebSocket
    startServer,
    stopServer,
    broadcast,
    sendToClient,
  };
};

/*
🌐 WEBSOCKET SERVER API

📱 USO NO CLIENTE:
const ws = new WebSocket('ws://192.168.1.100:9142');

📤 ENVIAR MENSAGENS:
ws.send(JSON.stringify({
  type: 'offer',
  data: { sdp: '...', type: 'offer' }
}));

📥 RECEBER MENSAGENS:
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // message.from contém ID do remetente
};

🔧 TIPOS SUPORTADOS:
- offer, answer, ice-candidate (WebRTC)
- join, leave (controle de sala)  
- qualquer string personalizada
*/
