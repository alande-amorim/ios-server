import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useNetInfoInstance } from '@react-native-community/netinfo';

const Home = () => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

  const config = {
    reachabilityUrl: 'https://clients3.google.com/generate_204',
    reachabilityTest: async (response: unknown) => response.status === 204,
    reachabilityLongTimeout: 60 * 1000, // 60s
    reachabilityShortTimeout: 5 * 1000, // 5s
    reachabilityRequestTimeout: 15 * 1000, // 15s
    reachabilityShouldRun: () => true,
    shouldFetchWiFiSSID: true, // met iOS requirements to get SSID
    useNativeReachability: false,
  };

  const { netInfo } = useNetInfoInstance(paused, config);

  useEffect(() => {
    if (netInfo && netInfo.isConnected) {
      setServerUrl(`http://${netInfo.details?.ipAddress}:9142`);
      setPaused(true);
    } else {
      setServerUrl(null);
      setPaused(false);
    }
  }, [netInfo]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <View style={{ alignItems: 'center' }}>
        <Text>Servidor rodando em: </Text>
        <Text style={{ fontWeight: 'bold', marginBottom: 20 }}>
          {serverUrl || 'Carregando...'}
        </Text>

        {serverUrl && (
          <QRCode
            value={serverUrl}
            size={200}
            backgroundColor="white"
            color="black"
          />
        )}
      </View>
    </View>
  );
};
export default Home;
