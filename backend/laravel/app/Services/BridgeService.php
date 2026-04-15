<?php

namespace App\Services;

use App\Models\BridgeRequest;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

class BridgeService
{
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
     * Process Solana->EVM: call relay script to mint CYBER.sol on EVM.
     */
    public function processSolToEvm(BridgeRequest $request): bool
    {
        if (! $request->isPending()) {
            return false;
        }

        $request->markProcessing();

        try {
            $amountWei = bcmul($request->amount, bcpow('10', '18'));
            $amountWei = explode('.', $amountWei)[0];

            $hardhatDir = base_path('/../../crypto/hardhat');

            $result = Process::path($hardhatDir)
                ->timeout(120)
                ->run([
                    'npx', 'tsx', 'scripts/relay-bridge.ts',
                    'sol_to_evm',
                    $request->recipient_address,
                    $amountWei,
                    (string) $request->source_nonce,
                ]);

            Log::info('Bridge relay', [
                'id' => $request->id,
                'stdout' => $result->output(),
                'stderr' => $result->errorOutput(),
                'exit' => $result->exitCode(),
            ]);

            if ($result->exitCode() !== 0) {
                $request->markFailed('Relay failed: '.$result->errorOutput());

                return false;
            }

            // Parse JSON from last line of output
            $lines = array_filter(explode("\n", trim($result->output())));
            $json = json_decode(end($lines), true);

            if ($json && isset($json['txHash'])) {
                $request->markCompleted($json['txHash']);

                return true;
            }

            $request->markFailed('Could not parse relay output');

            return false;
        } catch (\Exception $e) {
            $request->markFailed($e->getMessage());
            Log::error('Bridge: SolToEvm failed', ['id' => $request->id, 'error' => $e->getMessage()]);

            return false;
        }
    }

    /**
     * Process EVM->Solana: call relay script to unlock CYBER.sol SPL on Solana.
     */
    public function processEvmToSol(BridgeRequest $request): bool
    {
        if (! $request->isPending()) {
            return false;
        }

        $request->markProcessing();

        try {
            // Convert amount to Solana lamports (9 decimals)
            $amountLamports = bcmul($request->amount, bcpow('10', '9'));
            $amountLamports = explode('.', $amountLamports)[0];

            $anchorDir = base_path('/../../crypto/anchor');
            $home = env('HOME', $_SERVER['HOME'] ?? '/home/lain');
            $walletPath = $home.'/.config/solana/id.json';

            $result = Process::path($anchorDir)
                ->env([
                    'ANCHOR_PROVIDER_URL' => 'https://api.devnet.solana.com',
                    'ANCHOR_WALLET' => $walletPath,
                ])
                ->timeout(120)
                ->run([
                    'npx', 'tsx', 'scripts/relay-release-native.ts',
                    $request->recipient_address,
                    $amountLamports,
                    (string) $request->source_nonce,
                ]);

            Log::info('Bridge relay evm_to_sol', [
                'id' => $request->id,
                'stdout' => $result->output(),
                'stderr' => $result->errorOutput(),
                'exit' => $result->exitCode(),
            ]);

            if ($result->exitCode() !== 0) {
                $request->markFailed('Solana relay failed: '.$result->errorOutput());

                return false;
            }

            $lines = array_filter(explode("\n", trim($result->output())));
            $json = json_decode(end($lines), true);

            if ($json && isset($json['txHash'])) {
                $request->markCompleted($json['txHash']);

                return true;
            }

            $request->markFailed('Could not parse Solana relay output');

            return false;
        } catch (\Exception $e) {
            $request->markFailed($e->getMessage());
            Log::error('Bridge: EvmToSol failed', ['id' => $request->id, 'error' => $e->getMessage()]);

            return false;
        }
    }
}
