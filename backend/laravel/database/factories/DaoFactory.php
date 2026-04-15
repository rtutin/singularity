<?php

namespace Database\Factories;

use App\Models\Dao;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Dao>
 */
class DaoFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'address' => '0x'.fake()->sha1(),
            'name' => fake()->company(),
        ];
    }
}
