<script setup lang="ts">
import { ref } from 'vue';
import { Head, Link as InertiaLink, router, useForm } from '@inertiajs/vue3';
import { Edit, MessageSquare, Plus, ThumbsDown, ThumbsUp, Trash2, Vote } from 'lucide-vue-next';
import Heading from '@/components/Heading.vue';
import InputError from '@/components/InputError.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Dao, Proposal, Team } from '@/types';

type Props = {
    dao: Dao;
    proposals: Proposal[];
};

const props = defineProps<Props>();

const showForm = ref(false);
const editingProposal = ref<Proposal | null>(null);

const createForm = useForm({
    dao_id: props.dao.id,
    title: '',
    description: '',
});

const editForm = useForm({
    title: '',
    description: '',
    status: '' as string,
});

function openCreate() {
    editingProposal.value = null;
    createForm.reset();
    createForm.dao_id = props.dao.id;
    showForm.value = true;
}

function openEdit(proposal: Proposal) {
    editingProposal.value = proposal;
    editForm.title = proposal.title;
    editForm.description = proposal.description || '';
    editForm.status = proposal.status;
    showForm.value = true;
}

function submitCreate() {
    createForm.post(`/dao/${props.dao.id}/proposals`, {
        onSuccess: () => {
            showForm.value = false;
            createForm.reset();
            createForm.dao_id = props.dao.id;
        },
    });
}

function submitEdit() {
    if (!editingProposal.value) return;

    editForm.put(`/proposals/${editingProposal.value.id}`, {
        onSuccess: () => {
            showForm.value = false;
        },
    });
}

function deleteProposal(proposal: Proposal) {
    if (confirm(`Delete "${proposal.title}"?`)) {
        router.delete(`/proposals/${proposal.id}`);
    }
}

function formatAddress(address: string): string {
    if (address.length <= 12) return address;
    return address.slice(0, 6) + '...' + address.slice(-4);
}

defineOptions({
    layout: (props: { currentTeam?: Team | null }) => ({
        breadcrumbs: [
            { title: 'DAO', href: '/dao' },
            { title: 'Proposals', href: '#' },
        ],
    }),
});
</script>

<template>
    <Head :title="`DAO: ${props.dao.name}`" />

    <div class="flex flex-col space-y-6 m-2">
        <!-- DAO Header -->
        <div class="flex items-center justify-between">
            <div class="space-y-1">
                <Heading variant="small" :title="props.dao.name" description="Proposals for this DAO" />
                <div class="flex items-center gap-2">
                    <Badge variant="secondary" class="font-mono text-xs">{{ props.dao.address }}</Badge>
                </div>
            </div>
            <Button @click="openCreate">
                <Plus class="h-4 w-4 mr-1" /> New Proposal
            </Button>
        </div>

        <!-- Create / Edit form -->
        <div v-if="showForm" class="rounded-lg border p-4">
            <h3 class="mb-4 text-lg font-medium">
                {{ editingProposal ? 'Edit Proposal' : 'New Proposal' }}
            </h3>

            <!-- Create form -->
            <form v-if="!editingProposal" @submit.prevent="submitCreate" class="space-y-4">
                <div>
                    <label class="text-sm font-medium">Title</label>
                    <Input v-model="createForm.title" class="mt-1" placeholder="Proposal title" required />
                    <InputError :message="createForm.errors.title" />
                </div>
                <div>
                    <label class="text-sm font-medium">Description</label>
                    <textarea
                        v-model="createForm.description"
                        class="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
                        placeholder="Describe your proposal..."
                    />
                    <InputError :message="createForm.errors.description" />
                </div>
                <div class="flex gap-2">
                    <Button type="submit" :disabled="createForm.processing">Create</Button>
                    <Button type="button" variant="outline" @click="showForm = false">Cancel</Button>
                </div>
            </form>

            <!-- Edit form -->
            <form v-else @submit.prevent="submitEdit" class="space-y-4">
                <div>
                    <label class="text-sm font-medium">Title</label>
                    <Input v-model="editForm.title" class="mt-1" required />
                    <InputError :message="editForm.errors.title" />
                </div>
                <div>
                    <label class="text-sm font-medium">Description</label>
                    <textarea
                        v-model="editForm.description"
                        class="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
                    />
                    <InputError :message="editForm.errors.description" />
                </div>
                <div>
                    <label class="text-sm font-medium">Status</label>
                    <select
                        v-model="editForm.status"
                        class="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
                <div class="flex gap-2">
                    <Button type="submit" :disabled="editForm.processing">Update</Button>
                    <Button type="button" variant="outline" @click="showForm = false">Cancel</Button>
                </div>
            </form>
        </div>

        <!-- Proposals list -->
        <div class="space-y-3">
            <div
                v-for="proposal in props.proposals"
                :key="proposal.id"
                class="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
                <div class="flex items-center gap-4">
                    <div class="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Vote class="h-5 w-5" />
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <InertiaLink :href="`/proposals/${proposal.id}`" class="font-medium hover:underline">
                                {{ proposal.title }}
                            </InertiaLink>
                            <Badge :variant="proposal.status === 'open' ? 'default' : 'secondary'">
                                {{ proposal.status }}
                            </Badge>
                        </div>
                        <div class="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span>by {{ proposal.user?.name || 'Unknown' }}</span>
                            <span class="flex items-center gap-1">
                                <ThumbsUp class="h-3 w-3 text-green-500" /> {{ proposal.votes_for_count || 0 }}
                            </span>
                            <span class="flex items-center gap-1">
                                <ThumbsDown class="h-3 w-3 text-red-500" /> {{ proposal.votes_against_count || 0 }}
                            </span>
                            <span class="flex items-center gap-1">
                                <MessageSquare class="h-3 w-3" /> {{ proposal.comments_count || 0 }}
                            </span>
                        </div>
                    </div>
                </div>

                <TooltipProvider>
                    <div class="flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button variant="ghost" size="sm" @click="openEdit(proposal)">
                                    <Edit class="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Edit</p></TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button variant="ghost" size="sm" @click="deleteProposal(proposal)">
                                    <Trash2 class="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Delete</p></TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
            </div>

            <p v-if="props.proposals.length === 0" class="py-8 text-center text-muted-foreground">
                No proposals yet. Create one to get started.
            </p>
        </div>
    </div>
</template>
