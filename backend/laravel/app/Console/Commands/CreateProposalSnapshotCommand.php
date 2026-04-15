<?php

namespace App\Console\Commands;

use App\Models\Proposal;
use App\Services\TokenSnapshotService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('proposal:snapshot {proposal_id? : The proposal ID (optional, defaults to latest)}')]
#[Description('Create token balance snapshot for a proposal')]
class CreateProposalSnapshotCommand extends Command
{
    public function __construct(private TokenSnapshotService $snapshotService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $proposalId = $this->argument('proposal_id');

        if ($proposalId) {
            $proposal = Proposal::with('dao')->find($proposalId);

            if (! $proposal) {
                $this->error("Proposal #{$proposalId} not found.");

                return self::FAILURE;
            }

            $this->createSnapshot($proposal);
        } else {
            $proposals = Proposal::with('dao')
                ->where('status', 'open')
                ->latest()
                ->get();

            if ($proposals->isEmpty()) {
                $this->info('No open proposals found.');

                return self::SUCCESS;
            }

            $this->info("Creating snapshots for {$proposals->count()} proposal(s)...");

            foreach ($proposals as $proposal) {
                $this->createSnapshot($proposal);
            }
        }

        return self::SUCCESS;
    }

    private function createSnapshot(Proposal $proposal): void
    {
        $daoAddress = $proposal->dao?->address;

        if (! $daoAddress) {
            $this->warn("Proposal #{$proposal->id}: No DAO address, skipping.");

            return;
        }

        $before = $proposal->snapshots()->count();
        $this->snapshotService->createSnapshot($proposal);
        $after = $proposal->snapshots()->count();
        $added = $after - $before;

        $this->info("Proposal #{$proposal->id} ({$proposal->title}): {$added} snapshot(s) created.");
    }
}
