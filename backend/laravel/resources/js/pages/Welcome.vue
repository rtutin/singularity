<script setup lang="ts">
import { Head, Link, router, usePage } from '@inertiajs/vue3';
import { Wallet } from 'lucide-vue-next';
import { computed, onMounted } from 'vue';
import { useWallet } from '@/composables/useWallet';
import { useWalletAuth } from '@/composables/useWalletAuth';
import { dashboard, login, register } from '@/routes';

withDefaults(
    defineProps<{
        canRegister: boolean;
        price: {
            priceSol: number;
            priceUsd: number;
        } | null;
    }>(),
    {
        canRegister: true,
        price: null,
    },
);

const page = usePage();
const wallet = useWallet();
const walletAuth = useWalletAuth();

onMounted(() => {
    const user = page.props.auth?.user as
        | { wallet_address?: string | null }
        | undefined;
    wallet.restore(user?.wallet_address);
});

const dashboardUrl = computed(() => {
    return page.props.currentTeam
        ? dashboard(page.props.currentTeam.slug).url
        : '/';
});

const handleWalletConnect = async () => {
    const address = await wallet.connect();

    if (address) {
        try {
            const { nonce } = await walletAuth.generateNonce(address);
            const message = `Sign this message to authenticate with your wallet. Nonce: ${nonce}`;
            const signature = await wallet.signMessage(message);

            if (signature) {
                const response = await walletAuth.verifySignature(
                    address,
                    signature,
                );
                router.post('/login/web3', { token: response.token });
            }
        } catch {
            // Error handled by composable
        }
    }
};
</script>

<template>
    <Head title="Welcome">
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
    </Head>
    <div
        class="flex min-h-screen flex-col items-center bg-[#FDFDFC] p-6 text-[#1b1b18] lg:justify-center lg:p-8 dark:bg-[#0a0a0a]"
    >
        <header
            class="mb-6 w-full max-w-[335px] text-sm not-has-[nav]:hidden lg:max-w-4xl"
        >
            <nav class="flex items-center justify-end gap-4">
                <Link
                    v-if="$page.props.auth.user"
                    :href="dashboardUrl"
                    class="inline-block rounded-sm border border-[#19140035] px-5 py-1.5 text-sm leading-normal text-[#1b1b18] hover:border-[#1915014a] dark:border-[#3E3E3A] dark:text-[#EDEDEC] dark:hover:border-[#62605b]"
                >
                    Dashboard
                </Link>
                    <button
                        class="inline-block rounded-sm border border-transparent px-5 py-1.5 text-sm leading-normal text-[#1b1b18] hover:border-[#19140035] dark:text-[#EDEDEC] dark:hover:border-[#3E3E3A]"
                        :disabled="wallet.isConnecting.value"
                        @click="handleWalletConnect"
                    >
                        <div class="flex items-center gap-2">
                            <Wallet class="h-4 w-4" />
                            <span
                                v-if="wallet.isConnected.value"
                                class="font-mono"
                            >
                                {{
                                    wallet.formatAddress(wallet.address.value!)
                                }}
                            </span>
                            <span v-else>
                                {{
                                    wallet.isConnecting.value
                                        ? 'Connecting...'
                                        : 'Connect Wallet'
                                }}
                            </span>
                        </div>
                    </button>
                    <Link
                        :href="login()"
                        class="inline-block rounded-sm border border-transparent px-5 py-1.5 text-sm leading-normal text-[#1b1b18] hover:border-[#19140035] dark:text-[#EDEDEC] dark:hover:border-[#3E3E3A]"
                    >
                        Log in
                    </Link>
                    <Link
                        v-if="canRegister"
                        :href="register()"
                        class="inline-block rounded-sm border border-[#19140035] px-5 py-1.5 text-sm leading-normal text-[#1b1b18] hover:border-[#1915014a] dark:border-[#3E3E3A] dark:text-[#EDEDEC] dark:hover:border-[#62605b]"
                    >
                        Register
                    </Link>
            </nav>
        </header>
        <div
            class="w-full items-center justify-center text-white opacity-100 transition-opacity duration-750 lg:grow starting:opacity-0"
        >
            <div v-if="price" class="mb-4 rounded bg-gray-800 p-4">
                <p class="text-lg font-bold">CYBER Token</p>
                <p>Price SOL: {{ price.priceSol }}</p>
                <p>Price USD: {{ price.priceUsd }}</p>
            </div>
        </div>
        <div class="hidden h-14.5 lg:block"></div>
    </div>
</template>
