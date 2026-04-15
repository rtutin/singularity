<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('bridge_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('direction');           // sol_to_evm, evm_to_sol
            $table->string('source_chain');         // solana, cyberia
            $table->string('source_tx_hash');       // transaction hash on source chain
            $table->unsignedBigInteger('source_nonce');
            $table->string('sender_address');       // sender wallet on source chain
            $table->string('recipient_address');    // recipient wallet on destination chain
            $table->decimal('amount', 36, 18);
            $table->string('status')->default('pending'); // pending, processing, completed, failed
            $table->string('destination_tx_hash')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['source_chain', 'source_nonce']);
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bridge_requests');
    }
};
