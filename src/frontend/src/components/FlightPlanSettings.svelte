<section class="flight-plan-settings bg-[#1c1c1e] rounded-lg p-4 h-full text-white">
    <button>
        <i class="fas fa-save"></i>
        Save Flight Plan
    </button>
    <button>
        <i class="fas fa-trash-alt"></i>
        Clear Flight Plan
    </button>
    <button>
        <i class="fas fa-upload"></i>
        Import Flight Plan
    </button>
    <button>
        <i class="fas fa-download"></i>
        Export Flight Plan
    </button>

</section>

<style>
    .flight-plan-settings {
        display: flex;
        flex-direction: column;
        gap: 1em;
    }

    button {
        display: flex;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        background-color: #2d2d2d;
        border: none;
        border-radius: 0.5rem;
        color: white;
        font-size: calc(0.3rem + 0.5vw);
        cursor: pointer;
        align-items: center;
        justify-content: center;
    }

    button:hover {
        background-color: #3d3d3d;
    }

    button:first-of-type i {
        color: green;
    }

    button:nth-of-type(2) i {
        color: red;
    }

</style>