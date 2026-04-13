<script setup lang="ts">
import { computed, ref } from 'vue';
import { Head, Link as InertiaLink, router, useForm, usePage } from '@inertiajs/vue3';
import { Loader2, MessageSquare, ThumbsDown, ThumbsUp, Trash2, Users, Vote, Wallet } from 'lucide-vue-next';
import Heading from '@/components/Heading.vue';
import InputError from '@/components/InputError.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Proposal, ProposalVote, Team, User } from '@/types';
import { useWallet } from '@/composables/useWallet';

type Props = {
    proposal: Proposal;
    userVote: ProposalVote | null;
};

const props = defineProps<Props>();
const page = usePage();
const wallet = useWallet();

const authUser = computed(() => page.props.auth?.user as User | undefined);
const walletAddress = computed(() => wallet.address.value || authUser.value?.wallet_address || null);
const hasWallet = computed(() => !!walletAddress.value);
const isVoting = ref(false);
const voteError = ref<string | null>(null);

// Comment form
const commentForm = useForm({
    body: '',
});

function submitComment() {
    commentForm.post(`/proposals/${props.proposal.id}/comments`, {
        preserveScroll: true,
        onSuccess: () => {
            commentForm.reset();
        },
    });
}

function deleteComment(commentId: number) {
    if (confirm('Delete this comment?')) {
        router.delete(`/comments/${commentId}`, { preserveScroll: true });
    }
}

// Voting
const powerFor = computed(() => parseFloat(props.proposal.power_for || '0'));
const powerAgainst = computed(() => parseFloat(props.proposal.power_against || '0'));
const totalPower = computed(() => powerFor.value + powerAgainst.value);
const forPercent = computed(() => (totalPower.value > 0 ? (powerFor.value / totalPower.value) * 100 : 50));

async function castVote(support: boolean) {
    voteError.value = null;
    isVoting.value = true;

    try {
        if (!walletAddress.value) {
            const connected = await wallet.connect();
            if (!connected) {
                voteError.value = 'No wallet connected. Please connect your wallet first.';
                return;
            }
        }

        const voterAddress = walletAddress.value!;

        router.post(
            `/proposals/${props.proposal.id}/votes`,
            {
                wallet_address: voterAddress,
                voting_power: 1,
                support,
            },
            { preserveScroll: true },
        );
    } finally {
        isVoting.value = false;
    }
}

function formatPower(power: number): string {
    if (power === 0) return '0';
    if (power < 0.0001) return power.toExponential(2);
    const truncated = Math.trunc(power * 10000) / 10000;
    if (truncated < 1) return truncated.toString();
    if (truncated < 1000) return truncated.toFixed(4).replace(/\.?0+$/, '');
    return truncated.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatAddress(address: string): string {
    if (address.length <= 12) return address;
    return address.slice(0, 6) + '...' + address.slice(-4);
}

function timeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

defineOptions({
    layout: (props: { currentTeam?: Team | null }) => ({
        breadcrumbs: [
            { title: 'DAO', href: '/dao' },
            { title: 'Proposal', href: '#' },
        ],
    }),
});
</script>

<template>
    <Head :title="props.proposal.title" />

    <div class="flex flex-col space-y-6 m-2">
        <!-- Proposal header -->
        <div>
            <div class="flex items-center gap-2 mb-2">
                <InertiaLink
                    v-if="props.proposal.dao"
                    :href="`/dao/${props.proposal.dao.id}`"
                    class="text-sm text-muted-foreground hover:underline"
                >
                    {{ props.proposal.dao.name }}
                </InertiaLink>
                <span class="text-sm text-muted-foreground">/</span>
                <Badge :variant="props.proposal.status === 'open' ? 'default' : 'secondary'">
                    {{ props.proposal.status }}
                </Badge>
            </div>
            <Heading
                variant="small"
                :title="props.proposal.title"
                :description="`Created by ${props.proposal.user?.name || 'Unknown'} ${timeAgo(props.proposal.created_at)}`"
            />
            <p v-if="props.proposal.description" class="mt-4 text-sm leading-relaxed whitespace-pre-wrap">
                {{ props.proposal.description }}
            </p>
        </div>

        <!-- Voting section -->
        <div class="rounded-lg border p-5 space-y-5">
            <h3 class="text-lg font-medium flex items-center gap-2">
                <Vote class="h-5 w-5" /> Voting
            </h3>

            <!-- Results bar -->
            <div class="space-y-3">
                <!-- For -->
                <div class="space-y-1">
                    <div class="flex justify-between text-sm">
                        <span class="flex items-center gap-1 font-medium">
                            <ThumbsUp class="h-4 w-4 text-green-500" /> For
                        </span>
                        <span class="text-muted-foreground">
                            {{ formatPower(powerFor) }} tokens ({{ props.proposal.votes_for_count || 0 }} votes)
                        </span>
                    </div>
                    <div class="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                            class="h-full bg-green-500 rounded-full transition-all duration-500"
                            :style="{ width: totalPower > 0 ? `${(powerFor / totalPower) * 100}%` : '0%' }"
                        />
                    </div>
                </div>

                <!-- Against -->
                <div class="space-y-1">
                    <div class="flex justify-between text-sm">
                        <span class="flex items-center gap-1 font-medium">
                            <ThumbsDown class="h-4 w-4 text-red-500" /> Against
                        </span>
                        <span class="text-muted-foreground">
                            {{ formatPower(powerAgainst) }} tokens ({{ props.proposal.votes_against_count || 0 }} votes)
                        </span>
                    </div>
                    <div class="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                            class="h-full bg-red-500 rounded-full transition-all duration-500"
                            :style="{ width: totalPower > 0 ? `${(powerAgainst / totalPower) * 100}%` : '0%' }"
                        />
                    </div>
                </div>
            </div>

            <!-- Vote actions -->
            <div v-if="props.proposal.status === 'open'" class="space-y-3">
                <div class="flex gap-2">
                    <Button
                        :variant="props.userVote?.support === true ? 'default' : 'outline'"
                        :disabled="isVoting"
                        @click="castVote(true)"
                    >
                        <Loader2 v-if="isVoting" class="h-4 w-4 mr-1 animate-spin" />
                        <ThumbsUp v-else class="h-4 w-4 mr-1" />
                        Vote For
                    </Button>
                    <Button
                        :variant="props.userVote?.support === false ? 'destructive' : 'outline'"
                        :disabled="isVoting"
                        @click="castVote(false)"
                    >
                        <Loader2 v-if="isVoting" class="h-4 w-4 mr-1 animate-spin" />
                        <ThumbsDown v-else class="h-4 w-4 mr-1" />
                        Vote Against
                    </Button>
                </div>

                <p v-if="voteError" class="text-sm text-red-500">{{ voteError }}</p>

                <p v-if="props.userVote" class="text-sm text-muted-foreground flex items-center gap-1">
                    <Wallet class="h-3.5 w-3.5" />
                    You voted <strong>{{ props.userVote.support ? 'for' : 'against' }}</strong>
                    with {{ formatPower(parseFloat(props.userVote.voting_power)) }} voting power
                    from {{ formatAddress(props.userVote.wallet_address) }}
                </p>

                <p v-if="!hasWallet && !props.userVote" class="text-sm text-muted-foreground flex items-center gap-1">
                    <Wallet class="h-3.5 w-3.5" />
                    Connect your wallet to vote. Your token balance at the DAO contract = your voting power.
                </p>
            </div>

            <div v-else class="text-sm text-muted-foreground">
                This proposal is closed. Voting is no longer available.
            </div>

            <!-- Voters list -->
            <div v-if="props.proposal.votes && props.proposal.votes.length > 0">
                <h4 class="text-sm font-medium flex items-center gap-1 mb-2">
                    <Users class="h-4 w-4" /> Voters ({{ props.proposal.votes.length }})
                </h4>
                <div class="space-y-1">
                    <div
                        v-for="vote in props.proposal.votes"
                        :key="vote.id"
                        class="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted/50"
                    >
                        <div class="flex items-center gap-2">
                            <ThumbsUp v-if="vote.support" class="h-3.5 w-3.5 text-green-500" />
                            <ThumbsDown v-else class="h-3.5 w-3.5 text-red-500" />
                            <span>{{ vote.user?.name || 'Unknown' }}</span>
                            <Badge variant="outline" class="font-mono text-xs">{{ formatAddress(vote.wallet_address) }}</Badge>
                        </div>
                        <span class="text-muted-foreground">{{ formatPower(parseFloat(vote.voting_power)) }} tokens</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Comments section -->
        <div class="rounded-lg border p-5 space-y-5">
            <h3 class="text-lg font-medium flex items-center gap-2">
                <MessageSquare class="h-5 w-5" /> Comments ({{ props.proposal.comments?.length || 0 }})
            </h3>

            <!-- Add comment form -->
            <form @submit.prevent="submitComment" class="space-y-2">
                <textarea
                    v-model="commentForm.body"
                    class="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                    placeholder="Write a comment..."
                    required
                />
                <InputError :message="commentForm.errors.body" />
                <Button type="submit" size="sm" :disabled="commentForm.processing">
                    <Loader2 v-if="commentForm.processing" class="h-4 w-4 mr-1 animate-spin" />
                    Post Comment
                </Button>
            </form>

            <!-- Comments list -->
            <div class="space-y-3">
                <div
                    v-for="comment in props.proposal.comments"
                    :key="comment.id"
                    class="rounded-md border p-3"
                >
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-medium">{{ comment.user?.name || 'Unknown' }}</span>
                            <span class="text-xs text-muted-foreground">{{ timeAgo(comment.created_at) }}</span>
                        </div>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger as-child>
                                    <Button variant="ghost" size="sm" @click="deleteComment(comment.id)">
                                        <Trash2 class="h-3 w-3" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Delete</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                    <p class="text-sm whitespace-pre-wrap leading-relaxed">{{ comment.body }}</p>
                </div>
            </div>

            <p v-if="!props.proposal.comments?.length" class="text-sm text-muted-foreground text-center py-4">
                No comments yet. Be the first to comment.
            </p>
        </div>
    </div>
</template>
