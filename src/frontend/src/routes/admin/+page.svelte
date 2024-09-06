<script>
    import { onMount } from 'svelte';

    onMount(() => {
        window.location.href = `http://${window.location.hostname}:8090/_/`;
    });
</script>
