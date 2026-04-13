<?php

namespace Database\Factories;

use App\Models\Proposal;
use App\Models\ProposalSnapshot;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProposalSnapshot>
 */
class ProposalSnapshotFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'proposal_id' => Proposal::factory(),
            'wallet_address' => '0x'.fake()->sha1(),
            'balance' => fake()->randomFloat(4, 0, 1000),
            'snapshot_at' => now(),
        ];
    }
}
