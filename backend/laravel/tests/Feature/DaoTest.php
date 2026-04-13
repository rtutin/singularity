<?php

use App\Models\Dao;
use App\Models\User;

test('guests cannot access dao index', function () {
    $response = $this->get('/dao');

    $response->assertRedirect(route('login'));
});

test('authenticated users can view dao index', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/dao');

    $response->assertOk();
});

test('authenticated users can create a dao', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post('/dao', [
        'address' => '0x1234567890abcdef1234567890abcdef12345678',
        'name' => 'Test DAO',
    ]);

    $response->assertRedirect();
    $this->assertDatabaseHas('daos', [
        'address' => '0x1234567890abcdef1234567890abcdef12345678',
        'name' => 'Test DAO',
    ]);
});

test('dao creation requires name', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post('/dao', [
        'address' => '0x1234567890abcdef1234567890abcdef12345678',
    ]);

    $response->assertSessionHasErrors('name');
});

test('dao creation requires address', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post('/dao', [
        'name' => 'Test DAO',
    ]);

    $response->assertSessionHasErrors('address');
});

test('dao name must be unique', function () {
    $user = User::factory()->create();

    Dao::factory()->create(['name' => 'Unique DAO']);

    $response = $this->actingAs($user)->post('/dao', [
        'address' => '0xabcdef',
        'name' => 'Unique DAO',
    ]);

    $response->assertSessionHasErrors('name');
});

test('authenticated users can update a dao', function () {
    $user = User::factory()->create();
    $dao = Dao::factory()->create(['name' => 'Old Name', 'address' => '0xold']);

    $response = $this->actingAs($user)->put("/dao/{$dao->id}", [
        'name' => 'New Name',
        'address' => '0xnew',
    ]);

    $response->assertRedirect();
    $this->assertDatabaseHas('daos', [
        'id' => $dao->id,
        'name' => 'New Name',
        'address' => '0xnew',
    ]);
});

test('authenticated users can delete a dao', function () {
    $user = User::factory()->create();
    $dao = Dao::factory()->create();

    $response = $this->actingAs($user)->delete("/dao/{$dao->id}");

    $response->assertRedirect();
    $this->assertDatabaseMissing('daos', ['id' => $dao->id]);
});
