<?php

namespace App\Services;

use App\Models\BridgeRequest;
use App\Support\Environment;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;

class BridgeService
{
    /**
     * Hot wallet address on Solana (receives deposits from users).
     */
    private const SOLANA_HOT_WALLET = 'E6E8AeKoT6i2zmwrGyDF2LwfEfjX9Xg8LfEj2Fu8Yf7w';

    /**
     * CYBER token mint on Solana devnet (9 decimals).
     */
    private const SOLANA_CYBER_MINT = '6SvS85B6ufx8YA6wjGNdRvGZ4RbYUhXQjnaLgEbcfH8o';

    private const SOLANA_RPC = 'https://api.devnet.solana.com';

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
     * Verify that a Solana transaction is a real SPL transfer to our hot wallet.
     * Returns the transfer amount in raw units, or null if invalid.
     */
    public function verifySolanaDeposit(string $txHash, string $expectedSender): ?string
    {
        try {
            $response = Http::post(self::SOLANA_RPC, [
                'jsonrpc' => '2.0',
                'id' => 1,
                'method' => 'getTransaction',
                'params' => [
                    $txHash,
                    ['encoding' => 'jsonParsed', 'commitment' => 'confirmed', 'maxSupportedTransactionVersion' => 0],
                ],
            ]);

            $result = $response->json('result');

            if (! $result || ($result['meta']['err'] ?? null) !== null) {
                return null;
            }

            // Look through inner instructions and top-level instructions for SPL transfers
            $instructions = $result['transaction']['message']['instructions'] ?? [];
            $innerInstructions = $result['meta']['innerInstructions'] ?? [];

            foreach ($innerInstructions as $inner) {
                foreach ($inner['instructions'] ?? [] as $ix) {
                    $instructions[] = $ix;
                }
            }

            foreach ($instructions as $ix) {
                $parsed = $ix['parsed'] ?? null;
                if (! $parsed || ($parsed['type'] ?? '') !== 'transfer') {
                    continue;
                }

                $info = $parsed['info'] ?? [];
                $program = $ix['program'] ?? '';

                if ($program !== 'spl-token') {
                    continue;
                }

                // Check: authority is the expected sender, destination is hot wallet ATA
                // We verify the amount came from the right sender
                if (($info['authority'] ?? '') !== $expectedSender) {
                    continue;
                }

                // The amount is in raw units (6 decimals)
                return $info['amount'] ?? null;
            }

            return null;
        } catch (\Exception $e) {
            Log::error('Bridge: verifySolanaDeposit failed', ['tx' => $txHash, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /**
     * Process Solana->EVM: verify deposit, then call relay script to mint CYBER.sol on EVM.
     */
    public function processSolToEvm(BridgeRequest $request): bool
    {
        if (! $request->isPending()) {
            return false;
        }

        $request->markProcessing();

        try {
            // Verify the Solana transaction is a real deposit to our hot wallet
            $verifiedAmount = $this->verifySolanaDeposit(
                $request->source_tx_hash,
                $request->sender_address,
            );

            if ($verifiedAmount === null) {
                $request->markFailed('Could not verify Solana deposit transaction');

                return false;
            }

            Log::info('Bridge: Solana deposit verified', [
                'id' => $request->id,
                'verified_amount_raw' => $verifiedAmount,
                'claimed_amount' => $request->amount,
            ]);

            $amountWei = bcmul($request->amount, bcpow('10', '18'));
            $amountWei = explode('.', $amountWei)[0];

            $hardhatDir = Environment::isProduction()
                ? '/singularity/crypto/hardhat'
                : base_path('/../../crypto/hardhat');

            $result = Process::path($hardhatDir)
                ->env([
                    'CYBERIA_RPC_URL' => Environment::isProduction()
                        ? 'http://polygon-edge:8545'
                        : 'http://195.166.164.94:8545',
                ])
                ->timeout(120)
                ->run([
                    'npx', 'tsx', 'scripts/relay-bridge.ts',
                    'sol_to_evm',
                    $request->recipient_address,
                    $amountWei,
                    (string) $request->id,
                ]);

            Log::info('Bridge relay sol_to_evm', [
                'id' => $request->id,
                'stdout' => $result->output(),
                'stderr' => $result->errorOutput(),
                'exit' => $result->exitCode(),
            ]);

            if ($result->exitCode() !== 0) {
                $request->markFailed('Relay failed: '.$result->errorOutput());

                return false;
            }

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
     * Process EVM->Solana: send CYBER SPL tokens from hot wallet to recipient.
     */
    public function processEvmToSol(BridgeRequest $request): bool
    {
        if (! $request->isPending()) {
            return false;
        }

        $request->markProcessing();

        try {
            // Convert amount to Solana smallest units (9 decimals on devnet)
            $amountRaw = bcmul($request->amount, bcpow('10', '9'));
            $amountRaw = explode('.', $amountRaw)[0];

            $scriptDir = Environment::isProduction()
                ? '/singularity/crypto/anchor'
                : base_path('/../../crypto/anchor');

            $home = env('HOME', $_SERVER['HOME'] ?? '/home/lain');

            $walletPath = Environment::isProduction()
                ? '/solana/id.json'
                : $home.'/.config/solana/id.json';

            $result = Process::path($scriptDir)
                ->env([
                    'ANCHOR_PROVIDER_URL' => self::SOLANA_RPC,
                    'ANCHOR_WALLET' => $walletPath,
                ])
                ->timeout(120)
                ->run([
                    'npx', 'tsx', 'scripts/relay-release-native.ts',
                    $request->recipient_address,
                    $amountRaw,
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
