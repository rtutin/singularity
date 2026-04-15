<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProposalVoteRequest;
use App\Models\Proposal;
use App\Models\ProposalSnapshot;
use App\Services\TokenSnapshotService;
use Illuminate\Http\RedirectResponse;

class ProposalVoteController extends Controller
{
    public function __construct(private TokenSnapshotService $snapshotService) {}

    public function store(StoreProposalVoteRequest $request, Proposal $proposal): RedirectResponse
    {
        $walletAddress = $request->validated('wallet_address');
        $support = $request->validated('support');
        $fallbackPower = $request->validated('voting_power', 1);

        $snapshot = ProposalSnapshot::where('proposal_id', $proposal->id)
            ->where('wallet_address', strtolower($walletAddress))
            ->first();

        if (! $snapshot && $proposal->dao?->address) {
            $daoAddress = $proposal->dao->address;
            $isNative = $this->snapshotService->isNativeToken($daoAddress);

            $balance = $isNative
                ? $this->snapshotService->getNativeBalance($walletAddress)
                : $this->snapshotService->getTokenBalance($daoAddress, $walletAddress);

            $snapshot = ProposalSnapshot::create([
                'proposal_id' => $proposal->id,
                'wallet_address' => strtolower($walletAddress),
                'balance' => $balance,
                'snapshot_at' => now(),
            ]);
        }

        $votingPower = $snapshot?->balance ?? $fallbackPower;

        $proposal->votes()->updateOrCreate(
            ['user_id' => auth()->id()],
            [
                'wallet_address' => $walletAddress,
                'voting_power' => $votingPower,
                'support' => $support,
            ],
        );

        return back()->with('success', 'Vote recorded');
    }
}
