<?php

use App\Models\Dao;
use App\Models\Proposal;
use App\Models\User;

test('guests cannot access dao page', function () {
    $dao = Dao::factory()->create();

    $response = $this->get("/dao/{$dao->id}");

    $response->assertRedirect(route('login'));
});

test('authenticated users can view dao with proposals', function () {
    $user = User::factory()->create();
    $dao = Dao::factory()->create();

    $response = $this->actingAs($user)->get("/dao/{$dao->id}");

    $response->assertOk();
});

test('authenticated users can create a proposal', function () {
    $user = User::factory()->create();
    $dao = Dao::factory()->create();

    $response = $this->actingAs($user)->post("/dao/{$dao->id}/proposals", [
        'dao_id' => $dao->id,
        'title' => 'Test Proposal',
        'description' => 'Some description',
    ]);

    $response->assertRedirect();
    $this->assertDatabaseHas('proposals', [
        'dao_id' => $dao->id,
        'user_id' => $user->id,
        'title' => 'Test Proposal',
    ]);
});

test('proposal creation requires title', function () {
    $user = User::factory()->create();
    $dao = Dao::factory()->create();

    $response = $this->actingAs($user)->post("/dao/{$dao->id}/proposals", [
        'dao_id' => $dao->id,
    ]);

    $response->assertSessionHasErrors('title');
});

test('proposal creation requires valid dao_id', function () {
    $user = User::factory()->create();
    $dao = Dao::factory()->create();

    $response = $this->actingAs($user)->post("/dao/{$dao->id}/proposals", [
        'dao_id' => 99999,
        'title' => 'Test',
    ]);

    $response->assertSessionHasErrors('dao_id');
});

test('authenticated users can update a proposal', function () {
    $user = User::factory()->create();
    $proposal = Proposal::factory()->create(['title' => 'Old Title']);

    $response = $this->actingAs($user)->put("/proposals/{$proposal->id}", [
        'title' => 'New Title',
    ]);

    $response->assertRedirect();
    $this->assertDatabaseHas('proposals', [
        'id' => $proposal->id,
        'title' => 'New Title',
    ]);
});

test('authenticated users can close a proposal', function () {
    $user = User::factory()->create();
    $proposal = Proposal::factory()->create(['status' => 'open']);

    $response = $this->actingAs($user)->put("/proposals/{$proposal->id}", [
        'status' => 'closed',
    ]);

    $response->assertRedirect();
    $this->assertDatabaseHas('proposals', [
        'id' => $proposal->id,
        'status' => 'closed',
    ]);
});

test('authenticated users can delete a proposal', function () {
    $user = User::factory()->create();
    $proposal = Proposal::factory()->create();

    $response = $this->actingAs($user)->delete("/proposals/{$proposal->id}");

    $response->assertRedirect();
    $this->assertDatabaseMissing('proposals', ['id' => $proposal->id]);
});

test('authenticated users can view a proposal', function () {
    $user = User::factory()->create();
    $proposal = Proposal::factory()->create();

    $response = $this->actingAs($user)->get("/proposals/{$proposal->id}");

    $response->assertOk();
});
