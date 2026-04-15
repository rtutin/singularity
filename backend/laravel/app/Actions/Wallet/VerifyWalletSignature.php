<?php

namespace App\Actions\Wallet;

use App\Actions\Teams\CreateTeam;
use App\Models\User;
use App\Models\WalletNonce;
use Elliptic\EC;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use kornrunner\Keccak;

class VerifyWalletSignature
{
    private EC $ec;

    public function __construct(
        private CreateTeam $createTeam
    ) {
        $this->ec = new EC('secp256k1');
    }

    public function handle(string $walletAddress, string $signature): User
    {
        $walletAddress = Str::lower($walletAddress);

        $nonce = WalletNonce::where('wallet_address', $walletAddress)->first();

        if (! $nonce || $nonce->isExpired()) {
            throw new \Exception('Invalid or expired nonce. Please request a new signature.');
        }

        $message = "Sign this message to authenticate with your wallet. Nonce: {$nonce->nonce}";
        $recoveredAddress = $this->recoverAddress($message, $signature);

        if (Str::lower($recoveredAddress) !== $walletAddress) {
            throw new \Exception('Signature verification failed.');
        }

        $nonce->delete();

        return $this->authenticateOrRegister($walletAddress);
    }

    private function recoverAddress(string $message, string $signature): string
    {
        $msgHash = $this->hashPersonalMessage($message);

        $sig = $this->parseSignature($signature);
        if (! $sig) {
            throw new \Exception('Invalid signature format.');
        }

        $recoveryParam = $this->getRecoveryParam($msgHash, $sig);

        $keyPair = $this->ec->keyFromPublic($this->ec->recoverPubKey($msgHash, $sig, $recoveryParam)->encode('array'));

        $publicKey = $keyPair->getPublic()->encode('array');
        if (count($publicKey) === 65 && $publicKey[0] === 0x04) {
            array_shift($publicKey);
        }

        return '0x'.substr($this->keccak256($publicKey), 24);
    }

    private function parseSignature(string $signature): ?array
    {
        $sig = trim($signature);

        if (str_starts_with($sig, '0x')) {
            $sig = substr($sig, 2);
        }

        if (strlen($sig) !== 130) {
            return null;
        }

        return [
            'r' => '0x'.substr($sig, 0, 64),
            's' => '0x'.substr($sig, 64, 64),
        ];
    }

    private function getRecoveryParam(string $msgHash, array $sig): int
    {
        $msgHashInt = gmp_init($msgHash, 16);
        $r = gmp_init($sig['r'], 16);
        $s = gmp_init($sig['s'], 16);

        for ($recId = 0; $recId < 4; $recId++) {
            try {
                $pubKey = $this->ec->recoverPubKey($msgHashInt, [
                    'r' => $r,
                    's' => $s,
                ], $recId);

                $p = $pubKey->encode('array');
                if (count($p) === 65 && $p[0] === 0x04) {
                    array_shift($p);
                }

                $addr = '0x'.substr($this->keccak256($p), 24);

                return $recId;
            } catch (\Exception $e) {
                continue;
            }
        }

        return 0;
    }

    private function hashPersonalMessage(string $message): string
    {
        $prefix = "\x19Ethereum Signed Message:\n".strlen($message);

        return $this->keccak256($prefix.$message);
    }

    private function keccak256(string|array $data): string
    {
        if (is_array($data)) {
            $data = implode('', array_map('chr', $data));
        }

        return Keccak::hash($data, 256);
    }

    private function authenticateOrRegister(string $walletAddress): User
    {
        return DB::transaction(function () use ($walletAddress) {
            $user = User::where('wallet_address', $walletAddress)->first();

            if (! $user) {
                $shortAddress = substr($walletAddress, 0, 10);
                $user = User::create([
                    'name' => "Wallet {$shortAddress}",
                    'email' => "wallet_{$walletAddress}@localhost",
                    'password' => null,
                    'wallet_address' => $walletAddress,
                ]);

                $this->createTeam->handle($user, "User's Team", isPersonal: true);
            }

            return $user;
        });
    }
}
