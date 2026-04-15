<?php

namespace App\Http\Controllers\Api;

use App\Actions\Wallet\GenerateNonce;
use App\Actions\Wallet\VerifySolanaSignature;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SolanaWalletAuthController extends Controller
{
    public function __construct(
        private GenerateNonce $generateNonce,
        private VerifySolanaSignature $verifySolanaSignature
    ) {}

    public function generateNonce(Request $request): JsonResponse
    {
        $request->validate([
            'wallet_address' => ['required', 'string', 'regex:/^[1-9A-HJ-NP-Za-km-z]{32,44}$/'],
        ]);

        $nonce = $this->generateNonce->handle($request->string('wallet_address')->value());

        return response()->json([
            'nonce' => $nonce,
            'message' => 'Sign this message to authenticate with your wallet.',
        ]);
    }

    public function verify(Request $request): JsonResponse
    {
        $request->validate([
            'wallet_address' => ['required', 'string', 'regex:/^[1-9A-HJ-NP-Za-km-z]{32,44}$/'],
            'signature' => ['required', 'string'],
        ]);

        try {
            $user = $this->verifySolanaSignature->handle(
                $request->string('wallet_address')->value(),
                $request->string('signature')->value()
            );

            $token = $user->createToken('solana-wallet-auth')->plainTextToken;

            return response()->json([
                'message' => 'Authentication successful',
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'solana_wallet_address' => $user->solana_wallet_address,
                ],
                'token' => $token,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 401);
        }
    }
}
