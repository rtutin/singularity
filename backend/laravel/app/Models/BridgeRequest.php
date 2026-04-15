<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BridgeRequest extends Model
{
    protected $fillable = [
        'user_id',
        'direction',
        'source_chain',
        'source_tx_hash',
        'source_nonce',
        'sender_address',
        'recipient_address',
        'amount',
        'status',
        'destination_tx_hash',
        'error_message',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:18',
            'source_nonce' => 'integer',
            'completed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isCompleted(): bool
    {
        return $this->status === 'completed';
    }

    public function markProcessing(): void
    {
        $this->update(['status' => 'processing']);
    }

    public function markCompleted(string $destinationTxHash): void
    {
        $this->update([
            'status' => 'completed',
            'destination_tx_hash' => $destinationTxHash,
            'completed_at' => now(),
        ]);
    }

    public function markFailed(string $error): void
    {
        $this->update([
            'status' => 'failed',
            'error_message' => $error,
        ]);
    }
}
