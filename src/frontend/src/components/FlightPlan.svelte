<div
  class="flightplan bg-[#1c1c1e] text-white p-4 rounded-lg h-full flex space-x-4 items-center overflow-x-auto"
>
    <div class="flex w-full justify-between">
        <div class="column flex flex-col items-center align-middle space-y-4">
            
        </div>  
    </div>  
</div>

<style>
  .column {
    flex: 1;
    padding: 0 1rem;
  }

  .separator {
    width: 1px;
    background-color: #4f4f50;
    margin: 0 1rem;
  }

  .form-checkbox,
  .form-range,
  .form-input,
  .alt-button,
  .rotate-button {
    appearance: none;
    background-color: #374151;
    transition: background-color 0.3s ease;
  }

  .form-checkbox:checked {
    background-color: #66e1ff;
  }

  .form-range::-webkit-slider-thumb {
    appearance: none;
    background-color: #66e1ff;
    width: 1rem;
    height: 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .form-range::-moz-range-thumb {
    appearance: none;
    background-color: #66e1ff;
    width: 1rem;
    height: 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
  }

  .form-input {
    border: 1px solid #374151;
    padding: 0.5rem;
  }

  .form-input:focus {
    outline: none;
    border-color: #66e1ff;
  }

</style>
