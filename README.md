<div align="center">

# 🚁 MAV Manager GCS 📡

![Raspberry Pi Version](https://img.shields.io/badge/Raspberry_Pi-Zero%20%2F%204B-red?style=flat-square&logo=raspberry-pi)
![Docker Compose Version](https://img.shields.io/badge/Docker%20Compose-v2.27.1-blue?style=flat-square&logo=docker)
![PocketBase Version](https://img.shields.io/badge/PocketBase-v0.22.14-green?style=flat-square&logo=pocketbase)

A web-based ground control station (GCS) for remote autopilot management via MAVLink.  
*Tested on Raspberry Pi Zero with ArduPilot.*

<img src="screenshots/dashboard.png" alt="Illustration" width="auto"/>

</div>

---

<table align="center">
<tr>
<td>

<table align="center">

<th colspan="2" style="text-align: center;">🔧 Use Cases</th>
<tr>
<td>
      
📦 Package Delivery  
🛠️ Maintenance  
🌐 Remote Management  
🔋 Battery Monitoring  

</td>
<td>

🌍 Route Planning  
📉 Data Logging  
🚁 Flight Control  
📡 Communication  

</td>
</tr>
</table>


</td>
<td>


<table align="center">
<th colspan="2" style="text-align: center;">📚 Useful Documentation</th>
<tr>
<td>


- [Raspberry Pi Docs](https://www.raspberrypi.com/documentation)
- [Docker Docs](https://docs.docker.com/)
- [PocketBase Docs](https://pocketbase.io/docs/)
- [SvelteKit Docs](https://kit.svelte.dev/)

</td>
<td>

- [ArduPilot Docs](https://ardupilot.org/ardupilot/index.html)
- [MAVLink Protocol](https://mavlink.io/en/)
- [MAVLink Wiki](https://en.wikipedia.org/wiki/MAVLink)
- [Flight Controller Setup](https://ardupilot.org/copter/docs/initial-setup.html)

</td>
</tr>
</table>


</td>
</tr>

</table>

---

## 🛠 System Dependencies

Ensure your system has the following dependencies installed:
- Docker
- Docker Compose

<details>
<summary>👈 View Installation Instructions</summary>
<p>

**Install Docker:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

**Install Docker Compose:**
```bash
sudo apt-get install -y docker-compose
```

</p>
</details>

---

## 🐳 Building the Docker Containers
```bash
git clone git@github.com:judahpaul16/mmgcs.git && cd mmgcs
docker compose up
```
*Run with `-d` to detach the container from the terminal session*

---

## ✅ Compatibility
...

---

## 📜 License
This software is made available under a propietary End Use License Agreement. See the <a href="?tab=License-1-ov-file">`LICENSE`</a> file for more information.