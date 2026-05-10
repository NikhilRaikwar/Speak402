import React, { useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { ConversationProvider } from '@elevenlabs/react';
import { Analytics } from '@vercel/analytics/react';
import { SOLANA_RPC_URL } from '@/lib/constants';
import NotFound from './pages/NotFound';
import Index from './pages/Index';

import '@solana/wallet-adapter-react-ui/styles.css';

const App = () => {
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(
        () => SOLANA_RPC_URL || clusterApiUrl(network),
        [network]
    );

    const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <ConversationProvider>
                        <Routes>
                            <Route path="/" element={<Index />} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </ConversationProvider>
                    <Toaster />
                    <Analytics />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default App;
