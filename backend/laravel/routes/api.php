<?php

use App\Http\Controllers\Api\BridgeController;
use App\Http\Controllers\Api\SolanaWalletAuthController;
use App\Http\Controllers\Api\WalletAuthController;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;

// EVM wallet auth (MetaMask)
Route::prefix('wallet')->group(function () {
    Route::post('nonce', [WalletAuthController::class, 'generateNonce']);
    Route::post('verify', [WalletAuthController::class, 'verify']);
});

// Solana wallet auth (Phantom)
Route::prefix('solana-wallet')->group(function () {
    Route::post('nonce', [SolanaWalletAuthController::class, 'generateNonce']);
    Route::post('verify', [SolanaWalletAuthController::class, 'verify']);
});

// Bridge (public)
Route::get('bridge/{bridgeRequest}/status', [BridgeController::class, 'status']);

// Cyberia RPC proxy (avoids mixed content on HTTPS sites)
Route::post('rpc/cyberia', function (\Illuminate\Http\Request $request) {
    $response = Http::post(config('services.ethereum.rpc_url', 'http://195.166.164.94:8545'), $request->all());

    return response($response->body(), $response->status())
        ->header('Content-Type', 'application/json');
});
