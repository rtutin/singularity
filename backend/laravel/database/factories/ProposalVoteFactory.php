<?php

namespace Database\Factories;

use App\Models\Proposal;
use App\Models\ProposalVote;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ProposalVote>
 */
class ProposalVoteFactory extends Factory
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
            'user_id' => User::factory(),
            'wallet_address' => '0x'.fake()->sha1(),
            'voting_power' => fake()->randomFloat(4, 0, 1000),
            'support' => true,
        ];
    }
}
