import { BrowserProvider, Contract, formatEther, formatUnits } from 'ethers';
import { ref } from 'vue';

export type WalletState = {
    isConnected: boolean;
    isConnecting: boolean;
    address: string | null;
    balance: string | null;
    chainId: number | null;
    error: string | null;
};

const ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
];

const CYBER_CONTRACT = '0x38Fb766Fa8c03fc098B6Ff74d1Ed1293bDdAcF7f';

export type TokenBalance = {
    symbol: string;
    balance: string;
    formatted: string;
};

// Global singleton state — persists across component re-renders and page navigations
const isConnected = ref(false);
const isConnecting = ref(false);
const address = ref<string | null>(null);
const balance = ref<string | null>(null);
const chainId = ref<number | null>(null);
const error = ref<string | null>(null);
const cyberBalance = ref<TokenBalance | null>(null);
let listenersSetup = false;
let restored = false;

export const useWallet = () => {
    const isMetaMaskInstalled = (): boolean => {
        return typeof window !== 'undefined' && !!window.ethereum?.isMetaMask;
    };

    /**
     * Restore wallet state from the authenticated user's saved wallet_address
     * and try to silently reconnect via MetaMask (eth_accounts — no popup).
     * Should be called once on app mount.
     */
    const restore = async (savedAddress?: string | null): Promise<void> => {
        if (restored || isConnected.value) return;
        restored = true;

        // If user has a wallet_address saved in DB, set it immediately
        // so the UI shows the address even before MetaMask responds
        if (savedAddress) {
            address.value = savedAddress;
            isConnected.value = true;
        }

        // Try silent reconnect through MetaMask (no popup)
        if (isMetaMaskInstalled()) {
            try {
                const accounts = (await window.ethereum!.request({
                    method: 'eth_accounts',
                })) as string[];

                if (accounts.length > 0) {
                    address.value = accounts[0];
                    isConnected.value = true;
                    setupListeners();
                    // Fire-and-forget — don't block UI
                    fetchBalance();
                    fetchChainId();
                    fetchCyberBalance();
                }
            } catch {
                // MetaMask not available or rejected — keep savedAddress if any
            }
        }
    };

    const connect = async (): Promise<string | null> => {
        if (!isMetaMaskInstalled()) {
            error.value = 'MetaMask is not installed. Please install it from metamask.io';
            return null;
        }

        error.value = null;
        isConnecting.value = true;

        try {
            const accounts = (await window.ethereum!.request({
                method: 'eth_requestAccounts',
            })) as string[];

            if (accounts.length === 0) {
                throw new Error('No accounts found');
            }

            address.value = accounts[0];
            isConnected.value = true;

            await fetchBalance();
            await fetchChainId();
            await fetchCyberBalance();

            setupListeners();

            return address.value;
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to connect wallet';
            isConnected.value = false;
            address.value = null;
            return null;
        } finally {
            isConnecting.value = false;
        }
    };

    const disconnect = (): void => {
        address.value = null;
        isConnected.value = false;
        balance.value = null;
        chainId.value = null;
        error.value = null;
        cyberBalance.value = null;
        removeListeners();
    };

    const fetchBalance = async (): Promise<void> => {
        if (!address.value || !window.ethereum) return;

        try {
            const provider = new BrowserProvider(window.ethereum);
            const balanceBigInt = await provider.getBalance(address.value);
            balance.value = formatEther(balanceBigInt);
        } catch {
            balance.value = null;
        }
    };

    const fetchCyberBalance = async (): Promise<void> => {
        if (!address.value || !window.ethereum) return;

        try {
            const provider = new BrowserProvider(window.ethereum);
            const contract = new Contract(CYBER_CONTRACT, ERC20_ABI, provider);

            const balanceRaw = (await contract.balanceOf(address.value)) as bigint;
            const decimals = (await contract.decimals()) as number;
            const symbol = (await contract.symbol()) as string;

            const formatted = formatUnits(balanceRaw, decimals);

            cyberBalance.value = {
                symbol,
                balance: balanceRaw.toString(),
                formatted,
            };
        } catch {
            cyberBalance.value = null;
        }
    };

    const fetchChainId = async (): Promise<void> => {
        if (!window.ethereum) return;

        try {
            const chainIdHex = (await window.ethereum.request({
                method: 'eth_chainId',
            })) as string;
            chainId.value = parseInt(chainIdHex, 16);
        } catch {
            chainId.value = null;
        }
    };

    const signMessage = async (message: string): Promise<string | null> => {
        if (!address.value || !window.ethereum) {
            error.value = 'Wallet not connected';
            return null;
        }

        try {
            const provider = new BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            const signature = await signer.signMessage(message);

            return signature;
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to sign message';
            return null;
        }
    };

    const setupListeners = (): void => {
        if (!window.ethereum || listenersSetup) return;
        listenersSetup = true;

        window.ethereum.on('accountsChanged', (accounts: unknown) => {
            const accs = accounts as string[];
            if (accs.length === 0) {
                disconnect();
            } else if (accs[0] !== address.value) {
                address.value = accs[0];
                fetchBalance();
                fetchCyberBalance();
            }
        });

        window.ethereum.on('chainChanged', () => {
            fetchChainId();
            fetchBalance();
            fetchCyberBalance();
        });

        window.ethereum.on('disconnect', () => {
            disconnect();
        });
    };

    const removeListeners = (): void => {
        if (!window.ethereum) return;
        listenersSetup = false;

        window.ethereum.removeAllListeners?.('accountsChanged');
        window.ethereum.removeAllListeners?.('chainChanged');
        window.ethereum.removeAllListeners?.('disconnect');
    };

    const formatAddress = (addr: string, chars = 4): string => {
        return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`;
    };

    return {
        isConnected,
        isConnecting,
        address,
        balance,
        chainId,
        error,
        cyberBalance,
        isMetaMaskInstalled,
        connect,
        disconnect,
        restore,
        signMessage,
        fetchBalance,
        fetchCyberBalance,
        fetchChainId,
        formatAddress,
    };
};
