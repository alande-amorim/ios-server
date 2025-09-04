# PoC: Servidor Web/Socket React Native

## Objetivo

Estudar viabilidade técnica e identificar desafios na implementação de servidor web/socket utilizando React Native como servidor para signaling WebRTC offline

## Funcionalidades a serem implementadas

### Inicialização do servidor
- **Obtenção do IP LAN**: Detecta automaticamente o endereço IP do dispositivo na rede local
- **Porta Aleatória**: Obtém uma porta livre disponível no sistema
- **Servidor Web**: Inicializa servidor HTTP no IP e porta detectados
- **Socket Server**: Inicializa servidor socket no mesmo IP e porta

### Endpoints e Listeners
- **HTTP Endpoint**: Responde a requisições GET/POST com `PONG + timestamp`
- **Socket Event Listener**: Escuta eventos e responde com `PONG + timestamp`

## Arquitetura da PoC

```
┌─────────────────┐    ┌─────────────────┐
│ Dispositivo iOS │    │   Cliente       │
│   ou Android    │    │ (Desktop/Mobile)│
│                 │    │                 │
│  React Native   │◄──►│  Browser/curl   │
│  HTTP Server    │    │  HTTP Client    │
│  Socket Server  │    │  Socket Client  │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────────────────┘
              Rede LAN Local
```

## O que deve ser avaliado na PoC

### Questões a serem respondidas para cada protocolo (HTTP/Socket) e plataforma (iOS/Android):

#### Viabilidade Técnica
- É possível implementar um servidor web via React Native?
- É possível implementar um servidor socket via React Native?
- Quais são as limitações técnicas de cada abordagem?

#### Complexidade de Implementação
- Qual a complexidade para detectar IP LAN automaticamente?
- Qual a complexidade para obter porta livre?
- Qual a complexidade para inicializar servidor HTTP?
- Qual a complexidade para inicializar servidor Socket?
- Quantas dependências externas são necessárias?
- Há diferenças significativas entre iOS e Android?

#### Bibliotecas e Tecnologias
- Quais bibliotecas são necessárias para cada funcionalidade?
- Existem alternativas disponíveis?
- Qual o nível de maturidade e suporte das bibliotecas?
- Há dependências nativas necessárias?
- Quais bibliotecas são production-ready vs experimentais?


#### Desempenho
- Qual o tempo de resposta para requisições HTTP?
- Qual o tempo de resposta para comunicação via Socket?
- Qual o consumo de bateria durante operação?
- Qual o uso de memória?
- Quantas conexões simultâneas são suportadas?
- Qual o throughput máximo de mensagens?

#### Estabilidade
- O servidor mantém funcionamento em background?
- Como se comporta durante mudanças de rede?
- Como gerencia erros de conexão?
- Há memory leaks durante operação prolongada?
- Como se recupera de falhas?

## Metodologia de Testes

### Testes de Viabilidade
1. **Teste de Inicialização**: Verificar se o servidor inicia corretamente
2. **Teste de Conectividade**: Confirmar acesso via browser/curl de outro dispositivo
3. **Teste de Resposta**: Validar resposta PONG + timestamp

### Testes de Performance
1. **Latência**: Medir tempo de resposta usando ferramentas como curl ou postman
2. **Stress Test**: Múltiplas requisições simultâneas
3. **Monitoramento de Recursos**: CPU, memória e bateria durante operação

### Testes de Estabilidade
1. **Teste de Longa Duração**: Servidor ativo por períodos prolongados
2. **Teste de Reconexão**: Comportamento após perda de conectividade
3. **Teste de Background**: Funcionamento quando app está em segundo plano

## Cenários de Teste

### Cenário 1: Servidor HTTP
- **Setup**: App React Native inicializa servidor HTTP na porta X
- **Teste**: Dispositivo externo acessa `http://[IP_DO_DISPOSITIVO]:[PORTA]/ping` via browser
- **Expectativa**: Resposta JSON com `{"message": "PONG", "timestamp": 1234567890}`

### Cenário 2: Servidor Socket
- **Setup**: App React Native inicializa servidor Socket na porta Y
- **Teste**: Cliente socket externo conecta e envia mensagem
- **Expectativa**: Resposta com `PONG + timestamp`

### Cenário 3: Múltiplos Clientes
- **Setup**: Servidor ativo
- **Teste**: 5+ clientes simultâneos fazendo requisições
- **Expectativa**: Todos recebem resposta sem degradação significativa

## Matriz de Comparação (a ser preenchida após testes)

| Critério | HTTP iOS | HTTP Android | Socket iOS | Socket Android |
|----------|----------|--------------|------------|----------------|
| **Viabilidade** | ? | ? | ? | ? |
| **Complexidade** | ? | ? | ? | ? |
| **Bibliotecas** | ? | ? | ? | ? |
| **Performance** | ? | ? | ? | ? |
| **Estabilidade** | ? | ? | ? | ? |


## Deliverables da PoC

### Relatório Final
Documento contendo:
- Análise comparativa entre HTTP vs Socket
- Análise comparativa entre iOS vs Android  
- Avaliação de bibliotecas disponíveis (maturidade, suporte, limitações)
- Limitações técnicas identificadas durante implementação
- Recomendações baseadas nos testes
- Próximos passos sugeridos

### Código de Exemplo
- Implementação funcional para cada cenário testado
- Scripts de teste automatizados
- Documentação de configuração

### Métricas Coletadas
- Tempos de resposta por cenário
- Consumo de recursos
- Taxa de sucesso/falha
- Logs de erro e comportamento

# Achados e Respostas
Deverão ser anotados aqui todos os achados realizados durante a execução da PoC.

- Não é 

## Bibliotecas
| Biblioteca | Finalidade | Status | Obs. |
|------------|------------|--------|------|
| **react-native-http-server** | servidor web | 🚫 | Android only, não mantida desde 2016, não é production ready |
| **expo-network** | network | 🚫 | Funciona apenas com Expo. Incapaz de obter IP LAN real devido a restrições de segurança do iOS. |

### expo-network
- Funciona apenas no Expo. 
- Incapaz de obter IP local real do dispositivo pois o Expo Go não possui permissões. Para funcionar, precisaria adicionar permissões ao app.json e gerar uma build com EAS, o que iria necessitar uma conta de desenvolvedor da Apple (99usd/ano).

---

