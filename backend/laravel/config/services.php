<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'ethereum' => [
        'rpc_url' => env('CYBERIA_RPC_URL'),
    ],

    'bridge' => [
        'evm_rpc_url' => env('BRIDGE_EVM_RPC_URL', env('CYBERIA_RPC_URL')),
        'evm_bridge_address' => env('BRIDGE_EVM_CONTRACT_ADDRESS'),
        'relayer_private_key' => env('BRIDGE_RELAYER_PRIVATE_KEY'),
        'relayer_address' => env('BRIDGE_RELAYER_ADDRESS'),
        'solana_rpc_url' => env('BRIDGE_SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
        'solana_bridge_program' => env('BRIDGE_SOLANA_PROGRAM_ID'),
    ],

];
