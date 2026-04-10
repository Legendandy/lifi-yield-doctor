// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit'
import {
  mainnet,
  optimism,
  bsc,
  gnosis,
  polygon,
  base,
  arbitrum,
  celo,
  avalanche,
  linea,
  scroll,
  mantle,
  sonic,
} from 'wagmi/chains'
import { BrowserRouter } from 'react-router-dom'
import { ToastProvider } from './components/ToastNotifications'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

// Chains not yet in wagmi's default exports — define them manually
const unichain = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.unichain.org'] } },
}

const berachain = {
  id: 80094,
  name: 'Berachain',
  nativeCurrency: { name: 'Bera', symbol: 'BERA', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.berachain.com'] } },
}

const katana = {
  id: 747,
  name: 'Katana',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.katana.network'] } },
}

const monad = {
  id: 10143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
}

const config = getDefaultConfig({
  appName: 'Yield Doctor',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: [
    mainnet,
    optimism,
    bsc,
    gnosis,
    unichain,
    polygon,
    monad,
    sonic,
    mantle,
    base,
    arbitrum,
    celo,
    avalanche,
    linea,
    berachain,
    scroll,
    katana,
  ],
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <BrowserRouter>
            <ToastProvider>
              <App />
            </ToastProvider>
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)