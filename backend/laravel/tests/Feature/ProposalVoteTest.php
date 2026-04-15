<?php

use App\Models\Proposal;
use App\Models\User;

test('authenticated users can vote on a proposal', function () {
    $user = User::factory()->create();
    $proposal = Proposal::factory()->create();

    $response = $this->actingAs($user)->post("/proposals/{$proposal->id}/votes", [
        'wallet_address' => '0x1234567890abcdef1234567890abcdef12345678',
        'support' => true,
    ]);

    $response->assertRedirect();
    $this->assertDatabaseHas('proposal_votes', [
        'proposal_id' => $proposal->id,
        'user_id' => $user->id,
        'wallet_address' => '0x1234567890abcdef1234567890abcdef12345678',
        'support' => true,
    ]);
});

test('user can change their vote', function () {
    $user = User::factory()->create();
    $proposal = Proposal::factory()->create();

    // First vote: for
    $this->actingAs($user)->post("/proposals/{$proposal->id}/votes", [
        'wallet_address' => '0xabc',
        'support' => true,
    ]);

    // Change vote: against
    $this->actingAs($user)->post("/proposals/{$proposal->id}/votes", [
        'wallet_address' => '0xabc',
        'support' => false,
    ]);

    // Should have only one vote record
    expect($proposal->votes()->where('user_id', $user->id)->count())->toBe(1);
    expect($proposal->votes()->where('user_id', $user->id)->first()->support)->toBeFalse();
});

test('vote requires wallet_address', function () {
    $user = User::factory()->create();
    $proposal = Proposal::factory()->create();

    $response = $this->actingAs($user)->post("/proposals/{$proposal->id}/votes", [
        'support' => true,
    ]);

    $response->assertSessionHasErrors('wallet_address');
});

test('guests cannot vote', function () {
    $proposal = Proposal::factory()->create();

    $response = $this->post("/proposals/{$proposal->id}/votes", [
        'wallet_address' => '0xabc',
        'support' => true,
    ]);

    $response->assertRedirect(route('login'));
});
