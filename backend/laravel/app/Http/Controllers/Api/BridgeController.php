<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessBridgeRequest;
use App\Models\BridgeRequest;
use App\Services\BridgeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BridgeController extends Controller
{
    public function __construct(
        private BridgeService $bridgeService
    ) {}

    /**
     * Submit a bridge request after the user has locked tokens on the source chain.
     */
    public function submit(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'direction' => ['required', 'in:sol_to_evm,evm_to_sol'],
            'source_tx_hash' => ['required', 'string'],
            'source_nonce' => ['required', 'integer', 'min:0'],
            'sender_address' => ['required', 'string'],
            'recipient_address' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'gt:0'],
        ]);

        $sourceChain = $validated['direction'] === 'sol_to_evm' ? 'solana' : 'cyberia';

        $bridgeRequest = $this->bridgeService->createRequest(
            userId: $request->user()?->id,
            direction: $validated['direction'],
            sourceChain: $sourceChain,
            sourceTxHash: $validated['source_tx_hash'],
            sourceNonce: $validated['source_nonce'],
            senderAddress: $validated['sender_address'],
            recipientAddress: $validated['recipient_address'],
            amount: $validated['amount'],
        );

        ProcessBridgeRequest::dispatchSync($bridgeRequest->id);

        $bridgeRequest->refresh();

        return response()->json([
            'message' => $bridgeRequest->isCompleted() ? 'Bridge completed' : 'Bridge request submitted',
            'bridge_request' => [
                'id' => $bridgeRequest->id,
                'direction' => $bridgeRequest->direction,
                'status' => $bridgeRequest->status,
                'amount' => $bridgeRequest->amount,
                'destination_tx_hash' => $bridgeRequest->destination_tx_hash,
                'error_message' => $bridgeRequest->error_message,
                'created_at' => $bridgeRequest->created_at,
            ],
        ], 201);
    }

    /**
     * Get the status of a bridge request.
     */
    public function status(BridgeRequest $bridgeRequest): JsonResponse
    {
        return response()->json([
            'id' => $bridgeRequest->id,
            'direction' => $bridgeRequest->direction,
            'source_chain' => $bridgeRequest->source_chain,
            'source_tx_hash' => $bridgeRequest->source_tx_hash,
            'sender_address' => $bridgeRequest->sender_address,
            'recipient_address' => $bridgeRequest->recipient_address,
            'amount' => $bridgeRequest->amount,
            'status' => $bridgeRequest->status,
            'destination_tx_hash' => $bridgeRequest->destination_tx_hash,
            'error_message' => $bridgeRequest->error_message,
            'created_at' => $bridgeRequest->created_at,
            'completed_at' => $bridgeRequest->completed_at,
        ]);
    }

    /**
     * List bridge requests for the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $requests = BridgeRequest::where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get([
                'id', 'direction', 'source_chain', 'source_tx_hash',
                'sender_address', 'recipient_address', 'amount',
                'status', 'destination_tx_hash', 'created_at', 'completed_at',
            ]);

        return response()->json(['data' => $requests]);
    }
}
