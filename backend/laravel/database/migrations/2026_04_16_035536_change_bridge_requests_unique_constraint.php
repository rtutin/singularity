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
        Schema::table('bridge_requests', function (Blueprint $table) {
            $table->dropUnique(['source_chain', 'source_nonce']);
            $table->unique('source_tx_hash');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('bridge_requests', function (Blueprint $table) {
            $table->dropUnique(['source_tx_hash']);
            $table->unique(['source_chain', 'source_nonce']);
        });
    }
};
