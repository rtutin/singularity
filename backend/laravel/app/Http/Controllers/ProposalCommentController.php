<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreProposalCommentRequest;
use App\Models\Proposal;
use App\Models\ProposalComment;
use Illuminate\Http\RedirectResponse;

class ProposalCommentController extends Controller
{
    public function store(StoreProposalCommentRequest $request, Proposal $proposal): RedirectResponse
    {
        $proposal->comments()->create([
            ...$request->validated(),
            'user_id' => auth()->id(),
        ]);

        return back()->with('success', 'Comment added');
    }

    public function destroy(ProposalComment $comment): RedirectResponse
    {
        $comment->delete();

        return back()->with('success', 'Comment deleted');
    }
}
