<?php

namespace App\Models;

use Database\Factories\DaoFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Dao extends Model
{
    /** @use HasFactory<DaoFactory> */
    use HasFactory;

    protected $fillable = [
        'address',
        'name',
    ];

    public function proposals(): HasMany
    {
        return $this->hasMany(Proposal::class);
    }
}
