import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers';
import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { ref } from 'vue';

const CYBERIA_CHAIN_ID = 49406;

// Solana (devnet)
const SOLANA_RPC = 'https://api.devnet.solana.com';
const SOLANA_BRIDGE_PROGRAM = new PublicKey('FRDGTfySMijDP7sjw3tQq9u2FtEHteUCZu5jR9MGErEJ');
const SOLANA_NATIVE_MINT = new PublicKey('6SvS85B6ufx8YA6wjGNdRvGZ4RbYUhXQjnaLgEbcfH8o');
const SOLANA_NATIVE_DECIMALS = 9;

// EVM (Cyberia)
const BRIDGE_ADDRESS = '0x9dA2781a1b71950EEd25C84Dc26AB683AE63aa39';
const CYBER_TOKEN_ADDRESS = '0x38Fb766Fa8c03fc098B6Ff74d1Ed1293bDdAcF7f';
const CYBERSOL_ERC20_ADDRESS = '0x609Ac374eAF2561b3d52B78D0B6ec41CECD365D9';

const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
];

const BRIDGE_ABI = [
    'function lockCyber(uint256 amount, bytes32 solanaRecipient)',
    'function redeemCyberSol(uint256 amount, bytes32 solanaRecipient)',
    'event LockCyber(address indexed sender, uint256 amount, bytes32 solanaRecipient, uint64 nonce)',
    'event RedeemCyberSol(address indexed sender, uint256 amount, bytes32 solanaRecipient, uint64 nonce)',
];

// State
const cyberBalance = ref<string | null>(null);
const cyberSolBalance = ref<string | null>(null);
const solanaCyberBalance = ref<string | null>(null);
const cyberDecimals = ref(18);
const cyberSolDecimals = ref(18);
const wrongNetwork = ref(false);

export const useBridge = () => {
    // ---------------------------------------------------------------
    //  Cyberia EVM
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
                    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x' + CYBERIA_CHAIN_ID.toString(16), chainName: 'Cyberia', nativeCurrency: { name: 'Cyber', symbol: 'CYBER', decimals: 18 }, rpcUrls: ['http://195.166.164.94:8545'] }] });
                    wrongNetwork.value = false; return true;
                } catch { wrongNetwork.value = true; return false; }
            }
        } catch { wrongNetwork.value = true; return false; }
    };

    const fetchCyberBalance = async (address: string): Promise<void> => {
        if (!window.ethereum) return;
        if (!(await ensureCyberiaNetwork())) { cyberBalance.value = null; return; }
        try {
            const provider = new BrowserProvider(window.ethereum);
            const contract = new Contract(CYBER_TOKEN_ADDRESS, ERC20_ABI, provider);
            const bal = (await contract.balanceOf(address)) as bigint;
            const dec = (await contract.decimals()) as number;
            cyberDecimals.value = dec;
            cyberBalance.value = formatUnits(bal, dec);
        } catch { cyberBalance.value = null; }
    };

    const fetchCyberSolBalance = async (address: string): Promise<void> => {
        if (!window.ethereum || wrongNetwork.value) { cyberSolBalance.value = null; return; }
        try {
            const provider = new BrowserProvider(window.ethereum);
            const contract = new Contract(CYBERSOL_ERC20_ADDRESS, ERC20_ABI, provider);
            const bal = (await contract.balanceOf(address)) as bigint;
            const dec = (await contract.decimals()) as number;
            cyberSolDecimals.value = dec;
            cyberSolBalance.value = formatUnits(bal, dec);
        } catch { cyberSolBalance.value = null; }
    };

    const lockCyberOnEvm = async (amount: string, solanaRecipientBase58: string): Promise<{ txHash: string; nonce: number } | null> => {
        if (!window.ethereum) return null;
        if (!(await ensureCyberiaNetwork())) throw new Error('Please switch to Cyberia network');
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const amountWei = parseUnits(String(amount), cyberDecimals.value);
        const token = new Contract(CYBER_TOKEN_ADDRESS, ERC20_ABI, signer);
        const allowance = (await token.allowance(await signer.getAddress(), BRIDGE_ADDRESS)) as bigint;
        if (allowance < amountWei) { const tx = await token.approve(BRIDGE_ADDRESS, amountWei); await tx.wait(); }
        const solRecipient = solanaBase58ToBytes32(solanaRecipientBase58);
        const bridge = new Contract(BRIDGE_ADDRESS, BRIDGE_ABI, signer);
        const tx = await bridge.lockCyber(amountWei, solRecipient);
        const receipt = await tx.wait();
        return { txHash: receipt.hash, nonce: parseEvmNonce(receipt) };
    };

    const redeemCyberSolOnEvm = async (amount: string, solanaRecipientBase58: string): Promise<{ txHash: string; nonce: number } | null> => {
        if (!window.ethereum) return null;
        if (!(await ensureCyberiaNetwork())) throw new Error('Please switch to Cyberia network');
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const amountWei = parseUnits(String(amount), cyberSolDecimals.value);
        const solRecipient = solanaBase58ToBytes32(solanaRecipientBase58);
        const bridge = new Contract(BRIDGE_ADDRESS, BRIDGE_ABI, signer);
        const tx = await bridge.redeemCyberSol(amountWei, solRecipient);
        const receipt = await tx.wait();
        return { txHash: receipt.hash, nonce: parseEvmNonce(receipt) };
    };

    // ---------------------------------------------------------------
    //  Solana
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

    const lockNativeOnSolana = async (amount: string, evmRecipientHex: string): Promise<{ txHash: string; nonce: number } | null> => {
        const phantom = getPhantom();
        if (!phantom?.publicKey) throw new Error('Phantom wallet not connected');

        const connection = new Connection(SOLANA_RPC, 'confirmed');
        const userPubkey = new PublicKey(phantom.publicKey.toBase58());

        // Derive PDAs
        const [bridgeConfig] = PublicKey.findProgramAddressSync(
            [Buffer.from('bridge')],
            SOLANA_BRIDGE_PROGRAM,
        );
        const [vault] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault'), SOLANA_NATIVE_MINT.toBuffer()],
            SOLANA_BRIDGE_PROGRAM,
        );

        // User ATA
        const userAta = await getAssociatedTokenAddress(SOLANA_NATIVE_MINT, userPubkey);

        // Build instruction data: discriminator(8) + amount(8 LE) + evm_recipient(20)
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

        // Phantom signs and sends
        const { signature } = await phantom.signAndSendTransaction(tx);

        // Confirm
        await connection.confirmTransaction(signature, 'confirmed');

        // Parse nonce from logs
        const txInfo = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        let nonce = 0;
        for (const log of txInfo?.meta?.logMessages ?? []) {
            const m = log.match(/nonce=(\d+)/);
            if (m) { nonce = parseInt(m[1], 10); break; }
        }

        return { txHash: signature, nonce };
    };

    return {
        cyberBalance, cyberSolBalance, solanaCyberBalance, wrongNetwork,
        fetchCyberBalance, fetchCyberSolBalance, fetchSolanaCyberBalance,
        lockCyberOnEvm, lockNativeOnSolana, redeemCyberSolOnEvm,
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
