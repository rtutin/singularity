<?php

use App\Http\Controllers\Api\BridgeController;
use App\Http\Controllers\Api\SolanaWalletAuthController;
use App\Http\Controllers\Api\WalletAuthController;
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
