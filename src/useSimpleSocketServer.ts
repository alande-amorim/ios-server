import { useEffect, useState, useRef } from 'react';
import TcpSocket from 'react-native-tcp-socket';

interface Client {
  id: string;
  socket: any;
}

interface Message {
  type: string;
  data?: any;
  from?: string;
}

export const useSimpleSocketServer = (port: number) => {
  const [isRunning, setIsRunning] = useState(false);
  const [clientCount, setClientCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const serverRef = useRef<any>(null);
  const clientsRef = useRef<Map<string, any>>(new Map());

  // EVENTO 1: Iniciar servidor
  const startServer = () => {
    try {
      const server: any = TcpSocket.createServer();

      // LISTENER 1: Nova conexão
      server.on('connection', (socket: any) => {
        const clientId = `client_${Date.now()}`;
        console.log(`✅ Cliente conectado: ${clientId}`);
        
        clientsRef.current.set(clientId, socket);
        setClientCount(clientsRef.current.size);

        // LISTENER 2: Dados recebidos
        socket.on('data', (data: Buffer) => {
          try {
            const message: Message = JSON.parse(data.toString());
            console.log(`📨 Mensagem de ${clientId}:`, message);

            // EVENTO 2: Retransmitir para outros clientes
            const messageWithSender = { ...message, from: clientId };
            broadcast(messageWithSender, clientId);
            
          } catch (err) {
            console.error('❌ Erro ao processar mensagem:', err);
          }
        });

        // LISTENER 3: Cliente desconectou
        socket.on('close', () => {
          console.log(`❌ Cliente desconectado: ${clientId}`);
          clientsRef.current.delete(clientId);
          setClientCount(clientsRef.current.size);
        });

        // LISTENER 4: Erro na conexão
        socket.on('error', (err: any) => {
          console.error(`❌ Erro no cliente ${clientId}:`, err);
          clientsRef.current.delete(clientId);
          setClientCount(clientsRef.current.size);
        });
      });

      // LISTENER 5: Servidor iniciado
      server.listen({ port, host: '0.0.0.0' }, () => {
        console.log(`🚀 Servidor rodando na porta ${port}`);
        setIsRunning(true);
        setError(null);
      });

      // LISTENER 6: Erro no servidor
      server.on('error', (err: any) => {
        console.error('❌ Erro no servidor:', err);
        setError(err.message);
        setIsRunning(false);
      });

      serverRef.current = server;
    } catch (err: any) {
      setError(err.message);
    }
  };

  // EVENTO 3: Parar servidor
  const stopServer = () => {
    if (serverRef.current) {
      clientsRef.current.forEach(socket => socket.destroy());
      clientsRef.current.clear();
      serverRef.current.close();
      serverRef.current = null;
      setIsRunning(false);
      setClientCount(0);
      console.log('⏹️ Servidor parado');
    }
  };

  // EVENTO 4: Broadcast (enviar para todos)
  const broadcast = (message: Message, excludeClientId?: string) => {
    const messageStr = JSON.stringify(message);
    
    clientsRef.current.forEach((socket, clientId) => {
      if (clientId !== excludeClientId && socket.readyState !== 'closed') {
        socket.write(messageStr);
      }
    });
  };

  // EVENTO 5: Enviar para cliente específico
  const sendToClient = (clientId: string, message: Message) => {
    const socket = clientsRef.current.get(clientId);
    if (socket && socket.readyState !== 'closed') {
      socket.write(JSON.stringify(message));
    }
  };

  // Cleanup
  useEffect(() => {
    return () => stopServer();
  }, []);

  return {
    // Estado
    isRunning,
    clientCount,
    error,
    
    // Eventos/Ações
    startServer,
    stopServer,
    broadcast,
    sendToClient,
  };
};

/*
RESUMO DOS EVENTOS:

📥 LISTENERS (O que o servidor escuta):
1. server.on('connection') - Nova conexão
2. socket.on('data') - Mensagem recebida
3. socket.on('close') - Cliente desconectou  
4. socket.on('error') - Erro na conexão
5. server.on('listening') - Servidor iniciado
6. server.on('error') - Erro no servidor

📤 EVENTS (O que o servidor faz):
1. startServer() - Iniciar servidor
2. stopServer() - Parar servidor
3. broadcast() - Enviar para todos
4. sendToClient() - Enviar para um cliente
5. socket.write() - Enviar dados para cliente

💬 MENSAGENS SUPORTADAS:
- Qualquer JSON válido
- Adiciona automaticamente campo 'from'
- Retransmite para outros clientes
*/
