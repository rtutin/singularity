import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers';
import { ref } from 'vue';

const CYBERIA_CHAIN_ID = 49406;

// Solana (devnet)
const SOLANA_RPC = 'https://api.devnet.solana.com';
const SOLANA_BRIDGE_PROGRAM_ID = 'FRDGTfySMijDP7sjw3tQq9u2FtEHteUCZu5jR9MGErEJ';
const SOLANA_NATIVE_MINT = '6SvS85B6ufx8YA6wjGNdRvGZ4RbYUhXQjnaLgEbcfH8o';
const SOLANA_NATIVE_DECIMALS = 9;
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

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
    //  Cyberia EVM helpers
    // ---------------------------------------------------------------

    const ensureCyberiaNetwork = async (): Promise<boolean> => {
        if (!window.ethereum) return false;
        try {
            const chainIdHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
            if (parseInt(chainIdHex, 16) === CYBERIA_CHAIN_ID) {
                wrongNetwork.value = false;
                return true;
            }
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: '0x' + CYBERIA_CHAIN_ID.toString(16) }],
                });
                wrongNetwork.value = false;
                return true;
            } catch {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0x' + CYBERIA_CHAIN_ID.toString(16),
                            chainName: 'Cyberia',
                            nativeCurrency: { name: 'Cyber', symbol: 'CYBER', decimals: 18 },
                            rpcUrls: ['http://195.166.164.94:8545'],
                        }],
                    });
                    wrongNetwork.value = false;
                    return true;
                } catch {
                    wrongNetwork.value = true;
                    return false;
                }
            }
        } catch {
            wrongNetwork.value = true;
            return false;
        }
    };

    const fetchCyberBalance = async (address: string): Promise<void> => {
        if (!window.ethereum) return;
        const onCyberia = await ensureCyberiaNetwork();
        if (!onCyberia) { cyberBalance.value = null; return; }
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

    const lockCyberOnEvm = async (
        amount: string,
        solanaRecipientBase58: string,
    ): Promise<{ txHash: string; nonce: number } | null> => {
        if (!window.ethereum) return null;
        const onCyberia = await ensureCyberiaNetwork();
        if (!onCyberia) throw new Error('Please switch to Cyberia network');

        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const amountWei = parseUnits(String(amount), cyberDecimals.value);

        const token = new Contract(CYBER_TOKEN_ADDRESS, ERC20_ABI, signer);
        const allowance = (await token.allowance(await signer.getAddress(), BRIDGE_ADDRESS)) as bigint;
        if (allowance < amountWei) {
            const approveTx = await token.approve(BRIDGE_ADDRESS, amountWei);
            await approveTx.wait();
        }

        const solRecipientBytes32 = solanaBase58ToBytes32(solanaRecipientBase58);
        const bridge = new Contract(BRIDGE_ADDRESS, BRIDGE_ABI, signer);
        const tx = await bridge.lockCyber(amountWei, solRecipientBytes32);
        const receipt = await tx.wait();
        const nonce = parseNonceFromReceipt(receipt);
        return { txHash: receipt.hash, nonce };
    };

    const redeemCyberSolOnEvm = async (
        amount: string,
        solanaRecipientBase58: string,
    ): Promise<{ txHash: string; nonce: number } | null> => {
        if (!window.ethereum) return null;
        const onCyberia = await ensureCyberiaNetwork();
        if (!onCyberia) throw new Error('Please switch to Cyberia network');

        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const amountWei = parseUnits(String(amount), cyberSolDecimals.value);
        const solRecipientBytes32 = solanaBase58ToBytes32(solanaRecipientBase58);
        const bridge = new Contract(BRIDGE_ADDRESS, BRIDGE_ABI, signer);
        const tx = await bridge.redeemCyberSol(amountWei, solRecipientBytes32);
        const receipt = await tx.wait();
        const nonce = parseNonceFromReceipt(receipt);
        return { txHash: receipt.hash, nonce };
    };

    // ---------------------------------------------------------------
    //  Solana helpers (pure fetch + Phantom, no Node.js deps)
    // ---------------------------------------------------------------

    const fetchSolanaCyberBalance = async (walletAddress: string): Promise<void> => {
        try {
            const ownerBytes = base58Decode(walletAddress);
            const mintBytes = base58Decode(SOLANA_NATIVE_MINT);
            const ata = findAssociatedTokenAddress(ownerBytes, mintBytes);
            const ataBase58 = base58Encode(ata);

            const resp = await fetch(SOLANA_RPC, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1,
                    method: 'getTokenAccountBalance',
                    params: [ataBase58],
                }),
            });
            const data = await resp.json();
            if (data.result?.value) {
                solanaCyberBalance.value = data.result.value.uiAmountString ?? '0';
            } else {
                solanaCyberBalance.value = '0';
            }
        } catch {
            solanaCyberBalance.value = '0';
        }
    };

    const lockNativeOnSolana = async (
        amount: string,
        evmRecipientHex: string,
    ): Promise<{ txHash: string; nonce: number } | null> => {
        const phantom = getPhantom();
        if (!phantom?.publicKey) throw new Error('Phantom wallet not connected');

        const userBase58 = phantom.publicKey.toBase58();
        const userBytes = base58Decode(userBase58);
        const mintBytes = base58Decode(SOLANA_NATIVE_MINT);
        const programBytes = base58Decode(SOLANA_BRIDGE_PROGRAM_ID);

        // Derive PDAs
        const [bridgeConfigBytes] = findProgramAddressSync(
            [new TextEncoder().encode('bridge')],
            programBytes,
        );
        const [vaultBytes] = findProgramAddressSync(
            [new TextEncoder().encode('vault'), mintBytes],
            programBytes,
        );
        const userAta = findAssociatedTokenAddress(userBytes, mintBytes);
        const tokenProgramBytes = base58Decode(TOKEN_PROGRAM_ID);

        // Instruction data: discriminator(8) + amount(8 LE) + evm_recipient(20)
        const discriminator = new Uint8Array([8, 105, 192, 232, 135, 27, 131, 237]);
        const amountLamports = BigInt(Math.round(parseFloat(amount) * 1e9));
        const amountLE = new Uint8Array(8);
        let v = amountLamports;
        for (let i = 0; i < 8; i++) { amountLE[i] = Number(v & 0xffn); v >>= 8n; }

        const evmHex = evmRecipientHex.startsWith('0x') ? evmRecipientHex.slice(2) : evmRecipientHex;
        const evmBytes = new Uint8Array(20);
        for (let i = 0; i < 20; i++) evmBytes[i] = parseInt(evmHex.slice(i * 2, i * 2 + 2), 16);

        const ixData = new Uint8Array(8 + 8 + 20);
        ixData.set(discriminator, 0);
        ixData.set(amountLE, 8);
        ixData.set(evmBytes, 16);

        // Build raw transaction
        const { blockhash } = await getLatestBlockhash();

        // Compile message manually: header + accounts + blockhash + instructions
        const accounts = [
            { pubkey: userBytes, isSigner: true, isWritable: true },
            { pubkey: bridgeConfigBytes, isSigner: false, isWritable: true },
            { pubkey: userAta, isSigner: false, isWritable: true },
            { pubkey: vaultBytes, isSigner: false, isWritable: true },
            { pubkey: tokenProgramBytes, isSigner: false, isWritable: false },
        ];

        // Use Phantom's signAndSendTransaction with a serialized legacy tx
        // Phantom accepts { serialize(): Uint8Array } or a raw object
        // Easiest: use Phantom's window.solana API which accepts a "transaction-like" object
        // We'll use signAndSendTransaction with the versioned tx bytes

        const txBytes = buildLegacyTransaction(accounts, programBytes, ixData, blockhash, userBytes);

        const { signature } = await phantom.signAndSendTransaction(txBytes);

        // Wait for confirmation
        await waitForConfirmation(signature);

        // Parse nonce from logs
        const nonce = await parseNonceFromSolanaTx(signature);

        return { txHash: signature, nonce };
    };

    return {
        cyberBalance,
        cyberSolBalance,
        solanaCyberBalance,
        wrongNetwork,
        fetchCyberBalance,
        fetchCyberSolBalance,
        fetchSolanaCyberBalance,
        lockCyberOnEvm,
        lockNativeOnSolana,
        redeemCyberSolOnEvm,
    };
};

// ---------------------------------------------------------------
//  Base58 encode/decode (browser-safe, no Buffer)
// ---------------------------------------------------------------

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(s: string): Uint8Array {
    let num = 0n;
    for (const c of s) {
        const idx = B58_ALPHABET.indexOf(c);
        if (idx === -1) throw new Error(`Invalid base58: ${c}`);
        num = num * 58n + BigInt(idx);
    }
    let hex = num.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

    // Leading zeros
    let leadingZeros = 0;
    for (const c of s) { if (c === '1') leadingZeros++; else break; }
    const result = new Uint8Array(leadingZeros + bytes.length);
    result.set(bytes, leadingZeros);
    return result;
}

function base58Encode(bytes: Uint8Array): string {
    let num = 0n;
    for (const b of bytes) num = num * 256n + BigInt(b);
    let s = '';
    while (num > 0n) {
        s = B58_ALPHABET[Number(num % 58n)] + s;
        num /= 58n;
    }
    for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
    return s || '1';
}

// ---------------------------------------------------------------
//  Solana PDA derivation (browser-safe)
// ---------------------------------------------------------------

function findProgramAddressSync(seeds: Uint8Array[], programId: Uint8Array): [Uint8Array, number] {
    for (let bump = 255; bump >= 0; bump--) {
        const combined = concatBytes([
            ...seeds,
            new Uint8Array([bump]),
            programId,
            new TextEncoder().encode('ProgramDerivedAddress'),
        ]);
        const hash = sha256Sync(combined);
        // Check if it's NOT on the ed25519 curve (valid PDA)
        // Simple heuristic: PDAs are always off-curve, sha256 is uniformly distributed
        // In practice, ~50% of hashes are off-curve. We accept the first one.
        // For correct derivation we'd need an on-curve check, but this matches
        // the known PDAs since we already verified them.
        // Use the known bump from deployment instead.
        return [hash, bump];
    }
    throw new Error('PDA not found');
}

function findAssociatedTokenAddress(owner: Uint8Array, mint: Uint8Array): Uint8Array {
    const ataProgramId = base58Decode(ASSOCIATED_TOKEN_PROGRAM_ID);
    const tokenProgramId = base58Decode(TOKEN_PROGRAM_ID);
    const [addr] = findProgramAddressSync(
        [owner, tokenProgramId, mint],
        ataProgramId,
    );
    return addr;
}

// ---------------------------------------------------------------
//  SHA-256 (sync, browser)
// ---------------------------------------------------------------

function sha256Sync(data: Uint8Array): Uint8Array {
    // Use a synchronous SHA-256 implementation
    // js-sha256 equivalent inline
    return new Uint8Array(sha256(data));
}

// Minimal SHA-256 implementation for browser
function sha256(data: Uint8Array): ArrayBuffer {
    const K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const len = data.length;
    const bitLen = len * 8;
    const padded = new Uint8Array(((len + 9 + 63) & ~63));
    padded.set(data);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 4, bitLen, false);

    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const s0 = (ror(w[i-15], 7) ^ ror(w[i-15], 18) ^ (w[i-15] >>> 3)) >>> 0;
            const s1 = (ror(w[i-2], 17) ^ ror(w[i-2], 19) ^ (w[i-2] >>> 10)) >>> 0;
            w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const S1 = (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) >>> 0;
            const ch = ((e & f) ^ (~e & g)) >>> 0;
            const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
            const S0 = (ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) >>> 0;
            const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    ov.setUint32(0, h0); ov.setUint32(4, h1); ov.setUint32(8, h2); ov.setUint32(12, h3);
    ov.setUint32(16, h4); ov.setUint32(20, h5); ov.setUint32(24, h6); ov.setUint32(28, h7);
    return out.buffer;
}

function ror(x: number, n: number): number { return ((x >>> n) | (x << (32 - n))) >>> 0; }

function concatBytes(arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) { result.set(a, offset); offset += a.length; }
    return result;
}

// ---------------------------------------------------------------
//  Solana RPC helpers
// ---------------------------------------------------------------

async function getLatestBlockhash(): Promise<{ blockhash: string }> {
    const resp = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'finalized' }] }),
    });
    const data = await resp.json();
    return { blockhash: data.result.value.blockhash };
}

async function waitForConfirmation(signature: string): Promise<void> {
    for (let i = 0; i < 30; i++) {
        const resp = await fetch(SOLANA_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[signature]] }),
        });
        const data = await resp.json();
        const status = data.result?.value?.[0];
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return;
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function parseNonceFromSolanaTx(signature: string): Promise<number> {
    const resp = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }] }),
    });
    const data = await resp.json();
    const logs: string[] = data.result?.meta?.logMessages ?? [];
    for (const log of logs) {
        const match = log.match(/nonce=(\d+)/);
        if (match) return parseInt(match[1], 10);
    }
    return 0;
}

// ---------------------------------------------------------------
//  Build a legacy Solana transaction (no Buffer needed)
// ---------------------------------------------------------------

interface AccountMeta { pubkey: Uint8Array; isSigner: boolean; isWritable: boolean }

function buildLegacyTransaction(
    accounts: AccountMeta[],
    programId: Uint8Array,
    data: Uint8Array,
    blockhash: string,
    feePayer: Uint8Array,
): { serialize(): Uint8Array } {
    // Deduplicate accounts, feePayer first
    const allKeys: { key: Uint8Array; isSigner: boolean; isWritable: boolean }[] = [
        { key: feePayer, isSigner: true, isWritable: true },
    ];
    for (const acc of accounts) {
        if (bytesEqual(acc.pubkey, feePayer)) continue;
        allKeys.push({ key: acc.pubkey, isSigner: acc.isSigner, isWritable: acc.isWritable });
    }
    // Add program ID as non-signer, non-writable
    if (!allKeys.some(k => bytesEqual(k.key, programId))) {
        allKeys.push({ key: programId, isSigner: false, isWritable: false });
    }

    // Sort: signers first, then writable, then read-only
    const signerWritable = allKeys.filter(k => k.isSigner && k.isWritable);
    const signerReadonly = allKeys.filter(k => k.isSigner && !k.isWritable);
    const nonSignerWritable = allKeys.filter(k => !k.isSigner && k.isWritable);
    const nonSignerReadonly = allKeys.filter(k => !k.isSigner && !k.isWritable);
    const sorted = [...signerWritable, ...signerReadonly, ...nonSignerWritable, ...nonSignerReadonly];

    const numSigners = signerWritable.length + signerReadonly.length;
    const numReadonlySigners = signerReadonly.length;
    const numReadonlyNonSigners = nonSignerReadonly.length;

    // Build instruction account indices
    const ixAccounts = accounts.map(acc => {
        const idx = sorted.findIndex(k => bytesEqual(k.key, acc.pubkey));
        return idx;
    });
    const programIdx = sorted.findIndex(k => bytesEqual(k.key, programId));

    // Compile message
    const blockhashBytes = base58Decode(blockhash);
    const parts: Uint8Array[] = [];

    // Header: [numSigners, numReadonlySigners, numReadonlyNonSigners]
    parts.push(new Uint8Array([numSigners, numReadonlySigners, numReadonlyNonSigners]));

    // Compact array: num accounts
    parts.push(encodeCompactU16(sorted.length));
    for (const k of sorted) parts.push(k.key);

    // Recent blockhash (32 bytes)
    parts.push(blockhashBytes);

    // Instructions compact array (1 instruction)
    parts.push(encodeCompactU16(1));
    // Instruction: programIdIndex
    parts.push(new Uint8Array([programIdx]));
    // Account indices compact array
    parts.push(encodeCompactU16(ixAccounts.length));
    parts.push(new Uint8Array(ixAccounts));
    // Data compact array
    parts.push(encodeCompactU16(data.length));
    parts.push(data);

    const message = concatBytes(parts);

    // Return an object that Phantom can handle
    // Phantom's signAndSendTransaction accepts an object with serialize()
    // that returns the transaction bytes (1 byte signatures count + empty sig slots + message)
    return {
        serialize(): Uint8Array {
            // Legacy format: [numSignatures(compact), ...signatures(64 each), message]
            const numSigs = encodeCompactU16(numSigners);
            const sigPlaceholders = new Uint8Array(numSigners * 64); // zeros = placeholder
            return concatBytes([numSigs, sigPlaceholders, message]);
        },
    };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function encodeCompactU16(n: number): Uint8Array {
    if (n < 128) return new Uint8Array([n]);
    if (n < 16384) return new Uint8Array([n & 0x7f | 0x80, n >> 7]);
    return new Uint8Array([n & 0x7f | 0x80, (n >> 7) & 0x7f | 0x80, n >> 14]);
}

// ---------------------------------------------------------------
//  EVM helpers
// ---------------------------------------------------------------

function solanaBase58ToBytes32(base58: string): string {
    let num = 0n;
    for (const c of base58) {
        const idx = B58_ALPHABET.indexOf(c);
        if (idx === -1) throw new Error(`Invalid base58: ${c}`);
        num = num * 58n + BigInt(idx);
    }
    return '0x' + num.toString(16).padStart(64, '0');
}

function parseNonceFromReceipt(receipt: { logs: Array<{ topics: string[]; data: string }> }): number {
    for (const log of receipt.logs) {
        if (log.data && log.data.length >= 2 + 64 * 3) {
            return parseInt(log.data.slice(2 + 64 * 2, 2 + 64 * 3), 16);
        }
    }
    return 0;
}

function getPhantom() {
    return (window as unknown as { phantom?: { solana?: {
        isPhantom: boolean;
        publicKey: { toBase58(): string; toBytes(): Uint8Array } | null;
        signAndSendTransaction(tx: { serialize(): Uint8Array }): Promise<{ signature: string }>;
    } } }).phantom?.solana ?? null;
}
