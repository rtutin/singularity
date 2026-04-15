<?php

namespace App\Actions\Wallet;

use App\Actions\Teams\CreateTeam;
use App\Models\User;
use App\Models\WalletNonce;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class VerifySolanaSignature
{
    public function __construct(
        private CreateTeam $createTeam
    ) {}

    public function handle(string $walletAddress, string $signatureBase64): User
    {
        $nonce = WalletNonce::where('wallet_address', $walletAddress)->first();

        if (! $nonce || $nonce->isExpired()) {
            throw new \Exception('Invalid or expired nonce. Please request a new signature.');
        }

        $message = "Sign this message to authenticate with your wallet. Nonce: {$nonce->nonce}";

        if (! $this->verifyEd25519Signature($walletAddress, $message, $signatureBase64)) {
            throw new \Exception('Signature verification failed.');
        }

        $nonce->delete();

        return $this->authenticateOrRegister($walletAddress);
    }

    /**
     * Verify an Ed25519 signature using PHP's sodium extension.
     *
     * Solana wallet addresses are base58-encoded Ed25519 public keys.
     * Phantom signs messages with the corresponding private key.
     */
    private function verifyEd25519Signature(string $walletAddress, string $message, string $signatureBase64): bool
    {
        try {
            $signature = base64_decode($signatureBase64, true);

            if ($signature === false || strlen($signature) !== SODIUM_CRYPTO_SIGN_BYTES) {
                return false;
            }

            $publicKey = $this->base58Decode($walletAddress);

            if (strlen($publicKey) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) {
                return false;
            }

            return sodium_crypto_sign_verify_detached($signature, $message, $publicKey);
        } catch (\Exception) {
            return false;
        }
    }

    /**
     * Decode a base58 string (Bitcoin/Solana alphabet).
     */
    private function base58Decode(string $input): string
    {
        $alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        $base = strlen($alphabet);

        $num = gmp_init(0);
        for ($i = 0; $i < strlen($input); $i++) {
            $pos = strpos($alphabet, $input[$i]);
            if ($pos === false) {
                throw new \Exception('Invalid base58 character.');
            }
            $num = gmp_add(gmp_mul($num, $base), $pos);
        }

        $hex = gmp_strval($num, 16);
        if (strlen($hex) % 2 !== 0) {
            $hex = '0'.$hex;
        }

        $bytes = hex2bin($hex);

        // Preserve leading zero bytes
        $leadingZeros = 0;
        for ($i = 0; $i < strlen($input); $i++) {
            if ($input[$i] === '1') {
                $leadingZeros++;
            } else {
                break;
            }
        }

        return str_repeat("\x00", $leadingZeros).$bytes;
    }

    private function authenticateOrRegister(string $walletAddress): User
    {
        return DB::transaction(function () use ($walletAddress) {
            $user = User::where('solana_wallet_address', $walletAddress)->first();

            if (! $user) {
                $shortAddress = Str::substr($walletAddress, 0, 8);
                $user = User::create([
                    'name' => "Solana {$shortAddress}",
                    'email' => "solana_{$walletAddress}@localhost",
                    'password' => null,
                    'solana_wallet_address' => $walletAddress,
                ]);

                $this->createTeam->handle($user, "User's Team", isPersonal: true);
            }

            return $user;
        });
    }
}
