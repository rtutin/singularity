<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateDaoRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'address' => 'sometimes|required|string',
            'name' => 'sometimes|required|string|unique:daos,name,'.$this->route('dao')->id,
        ];
    }
}
