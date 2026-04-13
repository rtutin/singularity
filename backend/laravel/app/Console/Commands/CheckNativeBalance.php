<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\TokenSnapshotService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('wallet:balance {address? : Wallet address or user ID}')]
#[Description('Check native token balance for a wallet address or user')]
class CheckNativeBalance extends Command
{
    public function __construct(private TokenSnapshotService $snapshotService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $address = $this->argument('address');

        if (! $address) {
            $this->error('Please provide a wallet address or user ID.');

            return self::FAILURE;
        }

        $walletAddress = $this->resolveWalletAddress($address);

        if (! $walletAddress) {
            $this->error("Could not resolve wallet address from: {$address}");

            return self::FAILURE;
        }

        $balance = $this->snapshotService->getNativeBalance($walletAddress);

        $this->info("Wallet: {$walletAddress}");
        $this->info("Native balance: {$balance}");

        return self::SUCCESS;
    }

    private function resolveWalletAddress(string $input): ?string
    {
        if (str_starts_with($input, '0x') && strlen($input) === 42) {
            return $input;
        }

        if (is_numeric($input)) {
            $user = User::find($input);

            return $user?->wallet_address;
        }

        $user = User::where('wallet_address', $input)->first();

        return $user?->wallet_address;
    }
}
