<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
</script>

<template>
    <Head title="Cyberia NFT Market" />

    <main
        class="flex min-h-screen flex-col bg-[#FDFDFC] p-6 text-[#1b1b18] dark:bg-[#0a0a0a] dark:text-[#EDEDEC]"
    >
        <header
            class="mx-auto flex w-full max-w-5xl items-center justify-between text-sm"
        >
            <Link
                href="/"
                class="text-[#706f6c] hover:text-[#1b1b18] dark:text-[#A1A09A] dark:hover:text-[#EDEDEC]"
            >
                Cyberia
            </Link>
            <nav class="flex items-center gap-4" aria-label="Cyberia products">
                <Link href="/market" class="font-medium">NFT Market</Link>
                <Link
                    href="/lending"
                    class="text-[#706f6c] hover:text-[#1b1b18] dark:text-[#A1A09A] dark:hover:text-[#EDEDEC]"
                >
                    Lending
                </Link>
            </nav>
        </header>

        <section
            class="mx-auto flex w-full max-w-5xl flex-1 items-center py-24"
        >
            <div>
                <p
                    class="mb-3 text-xs tracking-[0.24em] text-[#706f6c] uppercase dark:text-[#A1A09A]"
                >
                    Cyberia product
                </p>
                <h1 class="text-4xl font-semibold tracking-tight">
                    NFT Market
                </h1>
            </div>
        </section>
    </main>
</template>
