<script>
  let name = "";
  let email = "";
  let password = "";
  let message = "";

  async function handleRegister(event) {
    event.preventDefault();

    try {
      const response = await fetch("http://localhost:8090/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        message = "Registration successful!";
        // Optionally redirect to another page
        // window.location.href = '/login';
      } else {
        message = data.error || "Registration failed. Please try again.";
      }
    } catch (error) {
      console.error("Error:", error);
      message = "An error occurred. Please try again.";
    }
  }
</script>

<h1>Go Register</h1>
<div>
  <h2>Register</h2>
  <form on:submit={handleRegister}>
    <input type="text" bind:value={name} placeholder="Name" required />
    <input type="email" bind:value={email} placeholder="Email" required />
    <input
      type="password"
      bind:value={password}
      placeholder="Password"
      required
    />
    <button type="submit">Register</button>
  </form>
  {#if message}
    <p>{message}</p>
  {/if}
</div>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 300px;
    margin: 0 auto;
  }
  input {
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  button {
    padding: 8px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover {
    background-color: #0056b3;
  }
  p {
    color: green;
  }
</style>
