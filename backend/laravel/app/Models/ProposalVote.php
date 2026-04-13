<?php

namespace App\Models;

use Database\Factories\ProposalVoteFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProposalVote extends Model
{
    /** @use HasFactory<ProposalVoteFactory> */
    use HasFactory;

    protected $fillable = [
        'proposal_id',
        'user_id',
        'wallet_address',
        'voting_power',
        'support',
    ];

    protected function casts(): array
    {
        return [
            'voting_power' => 'decimal:18',
            'support' => 'boolean',
        ];
    }

    public function proposal(): BelongsTo
    {
        return $this->belongsTo(Proposal::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
