import { useEffect, useState } from 'react';
import KeepAwake from 'react-native-keep-awake';
import { Text, View, TouchableOpacity, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useNetInfoInstance } from '@react-native-community/netinfo';
import { useSimpleSocketServer } from './useSimpleSocketServer';

const Home = () => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

  const config = {
    reachabilityUrl: 'https://clients3.google.com/generate_204',
    reachabilityTest: async (response: any) => response.status === 204,
    reachabilityLongTimeout: 60 * 1000, // 60s
    reachabilityShortTimeout: 5 * 1000, // 5s
    reachabilityRequestTimeout: 15 * 1000, // 15s
    reachabilityShouldRun: () => true,
    shouldFetchWiFiSSID: true, // met iOS requirements to get SSID
    useNativeReachability: false,
  };

  const { netInfo } = useNetInfoInstance(paused, config);
  const { isRunning, clientCount, error, startServer, stopServer } =
    useSimpleSocketServer(9142);

  useEffect(() => {
    KeepAwake.activate();
    return () => KeepAwake.deactivate();
  }, []);

  useEffect(() => {
    if (netInfo && netInfo.isConnected) {
      const details = netInfo.details as any;
      setServerUrl(`${details?.ipAddress}:9142`);
      setPaused(true);
    } else {
      setServerUrl(null);
      setPaused(false);
    }
  }, [netInfo]);

  const handleToggleServer = () => {
    if (isRunning) {
      stopServer();
    } else {
      if (netInfo?.isConnected) {
        startServer();
      } else {
        Alert.alert('Erro', 'Sem conexão de rede disponível');
      }
    }
  };

  const getStatusColor = () => {
    if (error) return '#ff4444';
    if (isRunning) return '#00aa00';
    return '#888888';
  };

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}
    >
      <View style={{ alignItems: 'center' }}>
        {/* Status do Servidor */}
        <View
          style={{
            backgroundColor: getStatusColor(),
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 20,
            marginBottom: 20,
          }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>
            {error ? 'ERRO' : isRunning ? 'SERVIDOR ATIVO' : 'SERVIDOR PARADO'}
          </Text>
        </View>

        {/* Informações do Servidor */}
        <Text style={{ fontSize: 16, marginBottom: 5 }}>
          Servidor Socket Simples:
        </Text>
        <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 18 }}>
          {serverUrl || 'Aguardando rede...'}
        </Text>

        {isRunning && (
          <Text style={{ color: '#666', marginBottom: 20 }}>
            {clientCount} cliente{clientCount !== 1 ? 's' : ''} conectado
            {clientCount !== 1 ? 's' : ''}
          </Text>
        )}

        {error && (
          <Text
            style={{ color: '#ff4444', marginBottom: 20, textAlign: 'center' }}
          >
            {error}
          </Text>
        )}

        {/* Botão de Controle */}
        <TouchableOpacity
          onPress={handleToggleServer}
          style={{
            backgroundColor: isRunning ? '#ff4444' : '#4CAF50',
            paddingHorizontal: 30,
            paddingVertical: 15,
            borderRadius: 25,
            marginBottom: 30,
          }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
            {isRunning ? 'PARAR SERVIDOR' : 'INICIAR SERVIDOR'}
          </Text>
        </TouchableOpacity>

        {/* QR Code */}
        {serverUrl && isRunning && (
          <>
            <Text style={{ marginBottom: 15, color: '#666' }}>
              Escaneie para conectar:
            </Text>
            <QRCode
              value={serverUrl}
              size={200}
              backgroundColor="white"
              color="black"
            />
          </>
        )}
      </View>
    </View>
  );
};
export default Home;
