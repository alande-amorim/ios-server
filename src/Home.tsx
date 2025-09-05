import { useEffect } from 'react';
import KeepAwake from 'react-native-keep-awake';
import { Text, View, TouchableOpacity, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useWebSocketServer } from './useWebSocketServer';

const Home = () => {
  const {
    isRunning,
    clientCount,
    serverUrl,
    netInfo,
    startServer,
    stopServer,
  } = useWebSocketServer(9142);

  useEffect(() => {
    startServer();
    KeepAwake.activate();
    return () => KeepAwake.deactivate();
  }, [startServer]);

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
        {isRunning && (
          <Text style={{ color: '#666', marginBottom: 20 }}>
            {clientCount} clients
          </Text>
        )}

        {/* Botão de Controle */}
        {!isRunning && (
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
              Start Server
            </Text>
          </TouchableOpacity>
        )}

        {/* QR Code */}
        {serverUrl && isRunning && (
          <>
            <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 18 }}>
              Server listening on:
            </Text>
            <Text style={{ fontSize: 16, marginBottom: 5 }}>{serverUrl}</Text>
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
