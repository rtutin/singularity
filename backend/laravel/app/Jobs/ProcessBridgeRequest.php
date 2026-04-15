<?php

namespace App\Jobs;

use App\Models\BridgeRequest;
use App\Services\BridgeService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class ProcessBridgeRequest implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(
        public int $bridgeRequestId
    ) {}

    public function handle(BridgeService $bridgeService): void
    {
        $request = BridgeRequest::find($this->bridgeRequestId);

        if (! $request || ! $request->isPending()) {
            return;
        }

        Log::info('Bridge: Processing request', [
            'id' => $request->id,
            'direction' => $request->direction,
        ]);

        match ($request->direction) {
            'sol_to_evm' => $bridgeService->processSolToEvm($request),
            'evm_to_sol' => $bridgeService->processEvmToSol($request),
            default => $request->markFailed("Unknown direction: {$request->direction}"),
        };
    }
}
