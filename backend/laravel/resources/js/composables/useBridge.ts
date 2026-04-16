import { BrowserProvider, Contract, formatUnits, parseUnits, JsonRpcProvider, Network } from 'ethers';
import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { ref } from 'vue';

const CYBERIA_RPC = 'https://rpc.cyberia.church';
const CYBERIA_CHAIN_ID = 49406;
const cyberiaNetwork = new Network('cyberia', CYBERIA_CHAIN_ID);

function getCyberiaProvider(): JsonRpcProvider {
    return new JsonRpcProvider(CYBERIA_RPC, cyberiaNetwork, { staticNetwork: cyberiaNetwork });
}

// Solana (devnet)
const SOLANA_RPC = 'https://api.devnet.solana.com';
const SOLANA_BRIDGE_PROGRAM = new PublicKey('FRDGTfySMijDP7sjw3tQq9u2FtEHteUCZu5jR9MGErEJ');
const SOLANA_NATIVE_MINT = new PublicKey('6SvS85B6ufx8YA6wjGNdRvGZ4RbYUhXQjnaLgEbcfH8o');
const SOLANA_NATIVE_DECIMALS = 9;

// EVM (Cyberia) — only CYBER.sol (bridged token)
const BRIDGE_ADDRESS = '0x9dA2781a1b71950EEd25C84Dc26AB683AE63aa39';
const CYBERSOL_ERC20_ADDRESS = '0x609Ac374eAF2561b3d52B78D0B6ec41CECD365D9';

const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
];

const BRIDGE_ABI = [
    'function redeemCyberSol(uint256 amount, bytes32 solanaRecipient)',
    'event RedeemCyberSol(address indexed sender, uint256 amount, bytes32 solanaRecipient, uint64 nonce)',
];

// State
const cyberSolBalance = ref<string | null>(null);
const solanaCyberBalance = ref<string | null>(null);
const cyberSolDecimals = ref(18);
const wrongNetwork = ref(false);

export const useBridge = () => {
    // ---------------------------------------------------------------
    //  EVM balance — read directly from Cyberia RPC, no MetaMask needed
    // ---------------------------------------------------------------

    const fetchCyberSolBalance = async (address: string): Promise<void> => {
        try {
            const provider = getCyberiaProvider();
            const contract = new Contract(CYBERSOL_ERC20_ADDRESS, ERC20_ABI, provider);
            const bal = (await contract.balanceOf(address)) as bigint;
            const dec = (await contract.decimals()) as number;
            cyberSolDecimals.value = dec;
            cyberSolBalance.value = formatUnits(bal, dec);
        } catch (e) {
            console.error('fetchCyberSolBalance failed:', e);
            cyberSolBalance.value = null;
        }
    };

    // ---------------------------------------------------------------
    //  Solana balance
    // ---------------------------------------------------------------

    const fetchSolanaCyberBalance = async (walletAddress: string): Promise<void> => {
        try {
            const connection = new Connection(SOLANA_RPC, 'confirmed');
            const owner = new PublicKey(walletAddress);
            const ata = await getAssociatedTokenAddress(SOLANA_NATIVE_MINT, owner);
            const account = await getAccount(connection, ata);
            solanaCyberBalance.value = (Number(account.amount) / 10 ** SOLANA_NATIVE_DECIMALS).toString();
        } catch {
            solanaCyberBalance.value = '0';
        }
    };

    // ---------------------------------------------------------------
    //  EVM -> Solana: burn CYBER.sol ERC20, relayer unlocks SPL on Solana
    // ---------------------------------------------------------------

    const ensureCyberiaNetwork = async (): Promise<boolean> => {
        if (!window.ethereum) return false;
        try {
            const chainIdHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
            if (parseInt(chainIdHex, 16) === CYBERIA_CHAIN_ID) { wrongNetwork.value = false; return true; }
            try {
                await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + CYBERIA_CHAIN_ID.toString(16) }] });
                wrongNetwork.value = false; return true;
            } catch {
                try {
                    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x' + CYBERIA_CHAIN_ID.toString(16), chainName: 'Cyberia', nativeCurrency: { name: 'Cyber', symbol: 'CYBER', decimals: 18 }, rpcUrls: [CYBERIA_RPC] }] });
                    wrongNetwork.value = false; return true;
                } catch { wrongNetwork.value = true; return false; }
            }
        } catch { wrongNetwork.value = true; return false; }
    };

    const redeemCyberSolOnEvm = async (amount: string, solanaRecipientBase58: string): Promise<{ txHash: string; nonce: number } | null> => {
        if (!window.ethereum) return null;
        if (!(await ensureCyberiaNetwork())) throw new Error('Please switch to Cyberia network');
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const amountWei = parseUnits(String(amount), cyberSolDecimals.value);
        const solRecipient = solanaBase58ToBytes32(solanaRecipientBase58);
        console.log('[bridge] redeemCyberSolOnEvm: sending tx', { amount, amountWei: amountWei.toString(), solRecipient });
        const bridge = new Contract(BRIDGE_ADDRESS, BRIDGE_ABI, signer);
        const tx = await bridge.redeemCyberSol(amountWei, solRecipient);
        console.log('[bridge] redeemCyberSolOnEvm: tx sent, waiting for receipt', { hash: tx.hash });
        const receipt = await tx.wait();
        console.log('[bridge] redeemCyberSolOnEvm: receipt received', { hash: receipt.hash, status: receipt.status, logs: receipt.logs.length });
        const nonce = parseEvmNonce(receipt);
        console.log('[bridge] redeemCyberSolOnEvm: parsed nonce', { nonce });
        return { txHash: receipt.hash, nonce };
    };

    // ---------------------------------------------------------------
    //  Solana -> EVM: lock CYBER.sol SPL, relayer mints ERC20 on EVM
    // ---------------------------------------------------------------

    const lockNativeOnSolana = async (amount: string, evmRecipientHex: string): Promise<{ txHash: string; nonce: number } | null> => {
        const phantom = getPhantom();
        if (!phantom?.publicKey) throw new Error('Phantom wallet not connected');

        const connection = new Connection(SOLANA_RPC, 'confirmed');
        const userPubkey = new PublicKey(phantom.publicKey.toBase58());

        const [bridgeConfig] = PublicKey.findProgramAddressSync(
            [Buffer.from('bridge')],
            SOLANA_BRIDGE_PROGRAM,
        );
        const [vault] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), SOLANA_NATIVE_MINT.toBuffer()],
            SOLANA_BRIDGE_PROGRAM,
        );
        const userAta = await getAssociatedTokenAddress(SOLANA_NATIVE_MINT, userPubkey);

        const discriminator = Buffer.from([8, 105, 192, 232, 135, 27, 131, 237]);
        const amountLamports = BigInt(Math.round(parseFloat(amount) * 10 ** SOLANA_NATIVE_DECIMALS));
        const amountBuf = Buffer.alloc(8);
        amountBuf.writeBigUInt64LE(amountLamports);

        const evmHex = evmRecipientHex.startsWith('0x') ? evmRecipientHex.slice(2) : evmRecipientHex;
        const evmBytes = Buffer.from(evmHex, 'hex');

        const data = Buffer.concat([discriminator, amountBuf, evmBytes]);

        const ix = new TransactionInstruction({
            programId: SOLANA_BRIDGE_PROGRAM,
            keys: [
                { pubkey: userPubkey, isSigner: true, isWritable: true },
                { pubkey: bridgeConfig, isSigner: false, isWritable: true },
                { pubkey: userAta, isSigner: false, isWritable: true },
                { pubkey: vault, isSigner: false, isWritable: true },
                { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            data,
        });

        const { blockhash } = await connection.getLatestBlockhash('finalized');
        const tx = new Transaction();
        tx.recentBlockhash = blockhash;
        tx.feePayer = userPubkey;
        tx.add(ix);

        console.log('[bridge] lockNativeOnSolana: signing and sending tx');
        const { signature } = await phantom.signAndSendTransaction(tx);
        console.log('[bridge] lockNativeOnSolana: tx sent, confirming', { signature });
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('[bridge] lockNativeOnSolana: tx confirmed');

        const txInfo = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        console.log('[bridge] lockNativeOnSolana: fetched tx info', { found: !!txInfo, logs: txInfo?.meta?.logMessages });
        let nonce = 0;
        for (const log of txInfo?.meta?.logMessages ?? []) {
            const m = log.match(/nonce=(\d+)/);
            if (m) { nonce = parseInt(m[1], 10); break; }
        }
        console.log('[bridge] lockNativeOnSolana: parsed nonce', { nonce });

        return { txHash: signature, nonce };
    };

    return {
        cyberSolBalance, solanaCyberBalance, wrongNetwork,
        fetchCyberSolBalance, fetchSolanaCyberBalance,
        lockNativeOnSolana, redeemCyberSolOnEvm,
    };
};

// ---------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function solanaBase58ToBytes32(base58: string): string {
    let num = 0n;
    for (const c of base58) { const i = B58.indexOf(c); if (i === -1) throw new Error('bad b58'); num = num * 58n + BigInt(i); }
    return '0x' + num.toString(16).padStart(64, '0');
}

function parseEvmNonce(receipt: { logs: Array<{ topics: string[]; data: string }> }): number {
    for (const log of receipt.logs) {
        if (log.data?.length >= 2 + 64 * 3) return parseInt(log.data.slice(2 + 64 * 2, 2 + 64 * 3), 16);
    }
    return 0;
}

function getPhantom() {
    type Phantom = {
        isPhantom: boolean;
        publicKey: { toBase58(): string; toBytes(): Uint8Array } | null;
        signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>;
    };
    return (window as unknown as { phantom?: { solana?: Phantom } }).phantom?.solana ?? null;
}
