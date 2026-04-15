<?php

namespace App\Services;

use App\Models\BridgeRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use kornrunner\Keccak;

class BridgeService
{
    private ?string $evmRpcUrl;

    private ?string $evmBridgeAddress;

    private ?string $relayerPrivateKey;

    public function __construct()
    {
        $this->evmRpcUrl = config('services.bridge.evm_rpc_url');
        $this->evmBridgeAddress = config('services.bridge.evm_bridge_address');
        $this->relayerPrivateKey = config('services.bridge.relayer_private_key');
    }

    /**
     * Record a bridge request initiated by a user.
     *
     * The user has already submitted the lock/redeem transaction on the source chain.
     * The relayer job will pick this up and execute the destination-side transaction.
     */
    public function createRequest(
        ?int $userId,
        string $direction,
        string $sourceChain,
        string $sourceTxHash,
        int $sourceNonce,
        string $senderAddress,
        string $recipientAddress,
        string $amount,
    ): BridgeRequest {
        return BridgeRequest::create([
            'user_id' => $userId,
            'direction' => $direction,
            'source_chain' => $sourceChain,
            'source_tx_hash' => $sourceTxHash,
            'source_nonce' => $sourceNonce,
            'sender_address' => $senderAddress,
            'recipient_address' => $recipientAddress,
            'amount' => $amount,
            'status' => 'pending',
        ]);
    }

    /**
     * Process a pending Solana->EVM bridge request.
     * Calls releaseCyberSol on the EVM bridge contract to mint wCYBER.sol.
     */
    public function processSolToEvm(BridgeRequest $request): bool
    {
        if (! $request->isPending()) {
            return false;
        }

        $request->markProcessing();

        try {
            // Build the releaseCyberSol(address to, uint256 amount, uint64 nonce) call
            $functionSelector = substr(
                $this->keccak256('releaseCyberSol(address,uint256,uint64)'),
                0,
                10
            );

            $to = str_pad(substr($request->recipient_address, 2), 64, '0', STR_PAD_LEFT);
            $amount = str_pad($this->toHex($request->amount), 64, '0', STR_PAD_LEFT);
            $nonce = str_pad(dechex($request->source_nonce), 64, '0', STR_PAD_LEFT);

            $data = $functionSelector.$to.$amount.$nonce;

            $txHash = $this->sendEvmTransaction($data);

            if ($txHash) {
                $request->markCompleted($txHash);
                Log::info('Bridge: SolToEvm completed', [
                    'request_id' => $request->id,
                    'tx_hash' => $txHash,
                ]);

                return true;
            }

            $request->markFailed('Failed to send EVM transaction');

            return false;
        } catch (\Exception $e) {
            $request->markFailed($e->getMessage());
            Log::error('Bridge: SolToEvm failed', [
                'request_id' => $request->id,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Process a pending EVM->Solana bridge request.
     * Calls releaseWrapped on the Solana bridge program to mint wCYBER.
     */
    public function processEvmToSol(BridgeRequest $request): bool
    {
        if (! $request->isPending()) {
            return false;
        }

        $request->markProcessing();

        try {
            // Solana transaction submission would go here.
            // This requires the Solana SDK / CLI or an RPC call to a Solana relayer service.
            // For now, we log the intent and mark as processing.
            Log::info('Bridge: EvmToSol needs Solana transaction', [
                'request_id' => $request->id,
                'recipient' => $request->recipient_address,
                'amount' => $request->amount,
                'nonce' => $request->source_nonce,
            ]);

            // TODO: Implement Solana transaction submission via CLI or RPC
            // solana program invoke --program-id <BRIDGE_PROGRAM> ...
            $request->markFailed('Solana relay not yet implemented');

            return false;
        } catch (\Exception $e) {
            $request->markFailed($e->getMessage());

            return false;
        }
    }

    /**
     * Send a raw transaction to the EVM bridge contract via JSON-RPC.
     */
    private function sendEvmTransaction(string $data): ?string
    {
        if (! $this->evmRpcUrl || ! $this->evmBridgeAddress || ! $this->relayerPrivateKey) {
            throw new \Exception('Bridge EVM configuration missing.');
        }

        // Get nonce
        $nonceResp = Http::post($this->evmRpcUrl, [
            'jsonrpc' => '2.0',
            'method' => 'eth_getTransactionCount',
            'params' => [$this->getRelayerAddress(), 'latest'],
            'id' => 1,
        ]);

        $nonce = $nonceResp->json('result');

        // Estimate gas
        $gasResp = Http::post($this->evmRpcUrl, [
            'jsonrpc' => '2.0',
            'method' => 'eth_estimateGas',
            'params' => [[
                'from' => $this->getRelayerAddress(),
                'to' => $this->evmBridgeAddress,
                'data' => '0x'.$data,
            ]],
            'id' => 2,
        ]);

        $gas = $gasResp->json('result') ?? '0x100000';

        // Get gas price
        $gasPriceResp = Http::post($this->evmRpcUrl, [
            'jsonrpc' => '2.0',
            'method' => 'eth_gasPrice',
            'params' => [],
            'id' => 3,
        ]);

        $gasPrice = $gasPriceResp->json('result') ?? '0x3B9ACA00';

        Log::info('Bridge: Sending EVM tx', [
            'to' => $this->evmBridgeAddress,
            'nonce' => $nonce,
            'gas' => $gas,
            'data_length' => strlen($data),
        ]);

        // NOTE: Actual transaction signing requires an Ethereum signing library.
        // In production, use a signer service or the relayer's private key with
        // a proper signing implementation (e.g., via a Node.js sidecar or PHP eth lib).
        // For now, we use eth_sendTransaction if the node supports unlocked accounts,
        // or log the raw data for manual/external processing.

        $txResp = Http::post($this->evmRpcUrl, [
            'jsonrpc' => '2.0',
            'method' => 'eth_sendTransaction',
            'params' => [[
                'from' => $this->getRelayerAddress(),
                'to' => $this->evmBridgeAddress,
                'gas' => $gas,
                'gasPrice' => $gasPrice,
                'nonce' => $nonce,
                'data' => '0x'.$data,
            ]],
            'id' => 4,
        ]);

        $txHash = $txResp->json('result');

        if (! $txHash) {
            $error = $txResp->json('error.message') ?? 'Unknown RPC error';
            throw new \Exception("EVM RPC error: {$error}");
        }

        return $txHash;
    }

    private function getRelayerAddress(): string
    {
        // Derive address from private key
        // For simplicity, this should be configured directly
        return config('services.bridge.relayer_address', '0x0000000000000000000000000000000000000000');
    }

    /**
     * Convert a decimal amount string to hex wei (18 decimals).
     */
    private function toHex(string $amount): string
    {
        $wei = bcmul($amount, bcpow('10', '18'));
        $wei = explode('.', $wei)[0]; // Remove any decimal part

        return gmp_strval(gmp_init($wei, 10), 16);
    }

    private function keccak256(string $data): string
    {
        return '0x'.Keccak::hash($data, 256);
    }
}
