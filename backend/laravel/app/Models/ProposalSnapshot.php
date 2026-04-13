<?php

namespace App\Models;

use Database\Factories\ProposalSnapshotFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProposalSnapshot extends Model
{
    /** @use HasFactory<ProposalSnapshotFactory> */
    use HasFactory;

    public $timestamps = false;

    protected $table = 'proposal_snapshots';

    protected $fillable = [
        'proposal_id',
        'wallet_address',
        'balance',
        'snapshot_at',
    ];

    protected function casts(): array
    {
        return [
            'balance' => 'decimal:18',
            'snapshot_at' => 'datetime',
        ];
    }

    public function proposal(): BelongsTo
    {
        return $this->belongsTo(Proposal::class);
    }
}
