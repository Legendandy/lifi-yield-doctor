import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { base, arbitrum, mainnet } from 'wagmi/chains'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'

const config = getDefaultConfig({
  appName: 'Yield Doctor',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // get free one at cloud.walletconnect.com
  chains: [base, arbitrum, mainnet],
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)