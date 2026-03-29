<?php
namespace App\Http\Controllers;

use Inertia\Inertia;
use Laravel\Fortify\Features;
use App\Services\YesNoApiService;

class ApiController extends Controller 
{

    public function index(YesNoApiService $yesNo) 
    {
        return Inertia::render("Welcome", [
            'canRegister' => Features::enabled(Features::registration()),
            'yesOrNo' => $yesNo->get(),
        ]);
    }
}