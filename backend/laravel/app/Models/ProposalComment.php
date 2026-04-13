<?php

namespace App\Models;

use Database\Factories\ProposalCommentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProposalComment extends Model
{
    /** @use HasFactory<ProposalCommentFactory> */
    use HasFactory;

    protected $fillable = [
        'proposal_id',
        'user_id',
        'body',
    ];

    public function proposal(): BelongsTo
    {
        return $this->belongsTo(Proposal::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
