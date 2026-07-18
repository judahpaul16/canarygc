<script lang="ts">
  import { onMount } from 'svelte';
  import { loggedInStore } from '../../stores/authStore';
  import { m } from '$lib/paraglide/messages';
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');

  let passwordStrength = $derived(calculatePasswordStrength(password));

  onMount(async () => {
    if ($loggedInStore) window.location.href = '/dashboard';
    const response = await fetch('/api/auth/checkAdmin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (result.adminExists) window.location.href = '/login';
  });

  async function handleSubmit() {
    if (!email || !password) {
      error = m.auth_fill_all_fields();
      return;
    }
    if (password !== confirmPassword) {
      error = m.auth_passwords_no_match();
      return;
    }
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, password, email })
    });
    if (response.status === 200) {
      loggedInStore.set(true);
      document.cookie = 'lastActivity=' + Date.now();
      window.location.href = '/dashboard';
    } else {
      const responseText = await response.json();
      error = m.auth_error({ message: responseText.message });
    }
  }

  function calculatePasswordStrength(pass: string): number {
    let strength = 0;
    if (pass.length >= 10) strength += 1;
    if (pass.match(/[a-z]/) && pass.match(/[A-Z]/)) strength += 1;
    if (pass.match(/\d/)) strength += 1;
    if (pass.match(/[^a-zA-Z\d]/)) strength += 1;
    return strength;
  }

  function getPasswordStrengthColor(strength: number): string {
    const colors = ['#ff4444', '#ffbb33', '#00C851', '#33b5e5'];
    return colors[strength - 1] || '#ff4444';
  }

  function getPasswordStrengthText(strength: number): string {
    const texts = [m.auth_strength_weak(), m.auth_strength_fair(), m.auth_strength_good(), m.auth_strength_strong()];
    return texts[strength - 1] || m.auth_strength_too_weak();
  }
</script>

<svelte:head>
  <title>{m.auth_register_page_title()}</title>
</svelte:head>

<div
  class="auth"
>
  <div class="card glass">
    <div class="brand">
      <img src="logo.png" alt="Canary Ground Control" class="logo" />
      <h1>{m.auth_register_heading()}</h1>
      <p class="sub">{m.auth_register_sub()}</p>
    </div>

    {#if error}
      <div class="error"><i class="fas fa-triangle-exclamation"></i> {error}</div>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <label for="email">{m.auth_email()}</label>
      <input type="email" id="email" bind:value={email} autocomplete="username" required />

      <label for="password">{m.auth_password()}</label>
      <input type="password" id="password" bind:value={password} autocomplete="new-password" required />
      <div class="strength">
        <span class="strength-label">{getPasswordStrengthText(passwordStrength)}</span>
        <div class="strength-track">
          <div
            class="strength-fill"
            style="width: {(passwordStrength / 4) * 100}%; background-color: {getPasswordStrengthColor(passwordStrength)}"
          ></div>
        </div>
      </div>
      <p class="hint">{m.auth_password_hint()}</p>

      <label for="confirmPassword">{m.auth_confirm_password()}</label>
      <input
        type="password"
        id="confirmPassword"
        bind:value={confirmPassword}
        autocomplete="new-password"
        required
      />

      <button type="submit" class="cta">{m.auth_create_account_button()} <i class="fas fa-arrow-right"></i></button>
    </form>
  </div>
</div>

<style>
  .auth {
    width: 100%;
    min-height: 95vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    color: var(--fontColor);
  }

  .glass {
    background-color: rgb(from var(--primaryColor) r g b / 62%);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 70%);
    border-radius: var(--radius-shell);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.28);
  }

  /* Dark mode sits over the satellite map, so the card takes a near-solid fill
     to keep the form legible; light mode stays translucent glass. */
  :global(html.dark) .glass {
    background-color: rgb(from var(--primaryColor) r g b / 94%);
  }

  .card {
    width: 100%;
    max-width: 400px;
    padding: 2.25rem 2rem;
    position: relative;
    overflow: hidden;
  }

  .card::before {
    content: '';
    position: absolute;
    top: -45%;
    left: 50%;
    width: 360px;
    height: 360px;
    transform: translateX(-50%);
    background: radial-gradient(circle, rgba(245, 197, 24, 0.16), transparent 62%);
    pointer-events: none;
  }

  .brand {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    margin-bottom: 1.5rem;
  }

  .logo {
    width: 52px;
    height: 52px;
    filter: drop-shadow(0 4px 12px rgba(245, 197, 24, 0.35));
    margin-bottom: 0.35rem;
  }

  .brand h1 {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .sub {
    opacity: 0.7;
    font-size: 0.9rem;
  }

  .error {
    margin-bottom: 1rem;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-control);
    background: rgba(220, 68, 68, 0.15);
    border: 1px solid rgba(220, 68, 68, 0.4);
    color: #ff8f8f;
    font-size: 0.85rem;
  }

  form {
    display: flex;
    flex-direction: column;
  }

  label {
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.85;
    margin-bottom: 0.35rem;
  }

  input {
    background-color: rgb(from var(--tertiaryColor) r g b / 85%);
    border: 1px solid rgb(from var(--secondaryColor) r g b / 80%);
    color: var(--fontColor);
    border-radius: var(--radius-control);
    padding: 0.6rem 0.8rem;
    margin-bottom: 0.9rem;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  input:focus {
    border-color: #f5c518;
    box-shadow: 0 0 0 3px rgba(245, 197, 24, 0.18);
  }

  .strength {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.4rem;
  }

  .strength-label {
    font-size: 0.75rem;
    min-width: 3rem;
    opacity: 0.8;
  }

  .strength-track {
    flex: 1;
    height: 6px;
    border-radius: 9999px;
    background: rgb(from var(--secondaryColor) r g b / 60%);
    overflow: hidden;
  }

  .strength-fill {
    height: 100%;
    border-radius: 9999px;
    transition: width 0.3s ease, background-color 0.3s ease;
  }

  .hint {
    font-size: 0.72rem;
    opacity: 0.6;
    margin-bottom: 1rem;
  }

  .cta {
    margin-top: 0.4rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: #f5c518;
    color: #1c1c1e;
    font-weight: 700;
    padding: 0.7rem 1.4rem;
    border: none;
    border-radius: var(--radius-control);
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }

  .cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(245, 197, 24, 0.35);
    background: #ffd23f;
  }
</style>
