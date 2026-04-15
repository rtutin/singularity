<?php

namespace App\Services;

use App\Models\Proposal;
use App\Models\ProposalSnapshot;
use App\Models\ProposalVote;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TokenSnapshotService
{
    private ?string $rpcUrl = null;

    public function __construct()
    {
        $this->rpcUrl = config('services.ethereum.rpc_url');
    }

    public function createSnapshot(Proposal $proposal): void
    {
        $daoAddress = $proposal->dao?->address;
        if (! $daoAddress) {
            return;
        }

        $isNative = $this->isNativeToken($daoAddress);
        $snapshotTime = now();

        if ($this->rpcUrl) {
            $walletAddresses = $this->getAllTokenHoldersViaRPC($daoAddress);

            if (empty($walletAddresses)) {
                $walletAddresses = $this->getAllKnownWalletAddresses($proposal);
            }

            foreach ($walletAddresses as $address) {
                $balance = $isNative
                    ? $this->getNativeBalance($address)
                    : $this->getTokenBalance($daoAddress, $address);

                if ($balance > 0) {
                    ProposalSnapshot::updateOrCreate(
                        [
                            'proposal_id' => $proposal->id,
                            'wallet_address' => strtolower($address),
                        ],
                        [
                            'balance' => $balance,
                            'snapshot_at' => $snapshotTime,
                        ]
                    );
                }
            }
        }

        Log::info('TokenSnapshot created', [
            'proposal_id' => $proposal->id,
            'dao' => $daoAddress,
            'is_native' => $isNative,
            'has_rpc' => (bool) $this->rpcUrl,
        ]);
    }

    public function isNativeToken(string $address): bool
    {
        $normalized = strtolower($address);

        return $normalized === '0x0000000000000000000000000000000000000000'
            || $normalized === '0x0'
            || $address === ''
            || strlen($address) < 20;
    }

    public function getNativeBalance(string $walletAddress): float
    {
        try {
            $response = Http::post($this->rpcUrl, [
                'jsonrpc' => '2.0',
                'method' => 'eth_getBalance',
                'params' => [$walletAddress, 'latest'],
                'id' => 1,
            ]);

            $result = $response->json('result');
            if ($result && is_string($result) && strlen($result) > 2) {
                $balanceWei = gmp_init($result, 16);

                return (float) bcdiv(gmp_strval($balanceWei), bcpow(10, 18), 18);
            }
        } catch (\Exception $e) {
        }

        return 0.0;
    }

    public function getTokenBalance(string $tokenAddress, string $walletAddress): float
    {
        if (! $this->rpcUrl) {
            return 0.0;
        }

        try {
            $response = Http::post($this->rpcUrl, [
                'jsonrpc' => '2.0',
                'method' => 'eth_call',
                'params' => [
                    [
                        'to' => $tokenAddress,
                        'data' => '0x70a08231000000000000000000000000'.substr($walletAddress, 2),
                    ],
                    'latest',
                ],
                'id' => 1,
            ]);

            $result = $response->json('result');
            if ($result && is_string($result) && strlen($result) > 2) {
                $balanceWei = gmp_init($result, 16);

                return (float) bcdiv(gmp_strval($balanceWei), bcpow(10, 18), 18);
            }
        } catch (\Exception $e) {
        }

        return 0.0;
    }

    public function getAllTokenHoldersViaRPC(string $tokenAddress): array
    {
        $seenAddresses = [];
        $transferSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df33b8cde';

        $fromBlock = $this->findDeploymentBlock($tokenAddress);
        $latestBlock = $this->getLatestBlockNumber();

        if ($fromBlock === 0 || $latestBlock === 0) {
            return [];
        }

        Log::info('TokenSnapshot scanning', [
            'token' => $tokenAddress,
            'from_block' => $fromBlock,
            'to_block' => $latestBlock,
        ]);

        $blockStep = 10000;
        $totalLogs = 0;
        $totalTransfers = 0;

        for ($start = $fromBlock; $start <= $latestBlock; $start += $blockStep) {
            $end = min($start + $blockStep - 1, $latestBlock);

            try {
                $response = Http::post($this->rpcUrl, [
                    'jsonrpc' => '2.0',
                    'method' => 'eth_getLogs',
                    'params' => [
                        [
                            'address' => $tokenAddress,
                            'fromBlock' => '0x'.dechex($start),
                            'toBlock' => '0x'.dechex($end),
                        ],
                    ],
                    'id' => 1,
                ]);

                $result = $response->json('result');
                if (! is_array($result)) {
                    continue;
                }

                $totalLogs += count($result);

                foreach ($result as $log) {
                    $topics = $log['topics'] ?? [];

                    if (empty($topics)) {
                        continue;
                    }

                    $topic0 = $topics[0] ?? '';

                    if (strpos($topic0, '0xddf252ad') === 0) {
                        $totalTransfers++;

                        if (isset($topics[2]) && strlen($topics[2]) >= 40) {
                            $toAddress = '0x'.substr($topics[2], -40);

                            if ($toAddress !== '0x0000000000000000000000000000000000000000' && strlen($toAddress) === 42) {
                                $key = strtolower($toAddress);
                                if (! isset($seenAddresses[$key])) {
                                    $seenAddresses[$key] = $toAddress;
                                }
                            }
                        }
                    }
                }
            } catch (\Exception $e) {
                Log::warning('TokenSnapshot scan error', [
                    'start' => $start,
                    'end' => $end,
                    'error' => $e->getMessage(),
                ]);

                continue;
            }
        }

        Log::info('TokenSnapshot scan complete', [
            'total_logs' => $totalLogs,
            'total_transfers' => $totalTransfers,
            'unique_holders' => count($seenAddresses),
        ]);

        return array_values($seenAddresses);
    }

    private function getKnownVotersFromDatabase(Proposal $proposal): array
    {
        return ProposalVote::where('proposal_id', $proposal->id)
            ->pluck('wallet_address')
            ->unique()
            ->values()
            ->all();
    }

    private function getAllKnownWalletAddresses(Proposal $proposal): array
    {
        $addresses = [];

        $userAddresses = User::whereNotNull('wallet_address')
            ->pluck('wallet_address')
            ->unique()
            ->values()
            ->all();
        foreach ($userAddresses as $addr) {
            $addresses[] = $addr;
        }

        $voteAddresses = ProposalVote::where('proposal_id', $proposal->id)
            ->pluck('wallet_address')
            ->unique()
            ->values()
            ->all();
        foreach ($voteAddresses as $addr) {
            if (! in_array($addr, $addresses)) {
                $addresses[] = $addr;
            }
        }

        return $addresses;
    }

    private function findDeploymentBlock(string $tokenAddress): int
    {
        $low = 0;
        $high = $this->getLatestBlockNumber();

        if ($high === 0) {
            return 0;
        }

        while ($low < $high) {
            $mid = intdiv($low + $high, 2);

            try {
                $response = Http::post($this->rpcUrl, [
                    'jsonrpc' => '2.0',
                    'method' => 'eth_getCode',
                    'params' => [$tokenAddress, '0x'.dechex($mid)],
                    'id' => 1,
                ]);

                $code = $response->json('result') ?? '';

                if (strlen($code) > 2) {
                    $high = $mid;
                } else {
                    $low = $mid + 1;
                }
            } catch (\Exception $e) {
                break;
            }
        }

        return $low;
    }

    private function getLatestBlockNumber(): int
    {
        try {
            $response = Http::post($this->rpcUrl, [
                'jsonrpc' => '2.0',
                'method' => 'eth_blockNumber',
                'params' => [],
                'id' => 1,
            ]);

            $result = $response->json('result');
            if ($result) {
                return (int) hexdec($result);
            }
        } catch (\Exception $e) {
        }

        return 0;
    }
}
