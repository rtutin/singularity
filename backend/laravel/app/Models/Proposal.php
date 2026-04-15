<?php

namespace App\Models;

use Database\Factories\ProposalFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Proposal extends Model
{
    /** @use HasFactory<ProposalFactory> */
    use HasFactory;

    protected $fillable = [
        'dao_id',
        'user_id',
        'title',
        'description',
        'status',
    ];

    public function dao(): BelongsTo
    {
        return $this->belongsTo(Dao::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(ProposalComment::class);
    }

    public function votes(): HasMany
    {
        return $this->hasMany(ProposalVote::class);
    }

    public function votesFor(): HasMany
    {
        return $this->votes()->where('support', true);
    }

    public function votesAgainst(): HasMany
    {
        return $this->votes()->where('support', false);
    }

    public function snapshots(): HasMany
    {
        return $this->hasMany(ProposalSnapshot::class);
    }
}
