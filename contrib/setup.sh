#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
NC='\033[0m' # No Color

#### SETUP ####
if [[ "$1" != "--install-only" && "$1" != "--simulation" ]]; then
    sudo apt-get update
    sudo apt-get -y install docker.io nginx ufw wget network-manager
    
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo systemctl status docker --no-pager
    
    # Enable and start the firewall
    echo "y" | sudo ufw enable
    sudo ufw allow 22
    sudo ufw allow 8090
    sudo ufw allow 8189
    sudo ufw allow 8889
    sudo ufw allow 5173
    sudo ufw allow 3000
    echo "y" | sudo ufw reload
    
    # Setup 4G networking if available
    modem=$(mmcli -L | grep -oP '/org/freedesktop/ModemManager1/Modem/\K[0-9]+')
    sudo mmcli -m $modem --simple-connect='apn=simbase,ip-type=ipv4v6' # Replace 'simbase' with your carrier's APN
    # Extract Bearer path from ModemManager
    bearer=$(mmcli -m $modem  | grep -oP 'Bearer\s+\|\s+paths:\s+/org/freedesktop/ModemManager1/Bearer/\K[0-9]+')
    
    # Check if the bearer number was successfully extracted
    if [ -z "$bearer" ]; then
        echo "Failed to extract Bearer number."
    fi
    
    # Get Bearer details
    bearer_info=$(mmcli --bearer=$bearer)
    
    # Extract relevant information
    ipv4_address=$(echo "$bearer_info" | grep -oP 'address:\s*\K[0-9.]+')
    ipv4_gateway=$(echo "$bearer_info" | grep -oP 'gateway:\s*\K[0-9.]+')
    ipv4_dns=$(echo "$bearer_info" | grep -oP 'dns:\s*\K[0-9., ]+' | tr ',' '\n')
    mtu=$(echo "$bearer_info" | grep -oP 'mtu:\s*\K[0-9]+')
    interface=$(echo "$bearer_info" | grep -oP 'interface:\s*\K[a-z]+[0-9]+')
    
    # Validate extracted data
    if [ -z "$ipv4_address" ] || [ -z "$ipv4_gateway" ] || [ -z "$interface" ]; then
        echo "Failed to extract necessary network configuration."
    fi
    
    # Set up the cellular network interface
    echo "Setting up the network interface: $interface"
    
    # Bring up the interface
    sudo ip link set "$interface" up
    
    # Set IPv4 address
    sudo ip addr add "$ipv4_address"/32 dev "$interface"
    
    # Set MTU if available
    if [ -n "$mtu" ]; then
        sudo ip link set dev "$interface" mtu "$mtu"
    fi
    
    # Set default route
    sudo ip route add default via "$ipv4_gateway" dev "$interface" onlink
    
    # Configure DNS
    echo "Configuring DNS..."
    for dns_server in $ipv4_dns; do
        # Check if the DNS server is already in /etc/resolv.conf
        if ! grep -q "nameserver $dns_server" /etc/resolv.conf; then
            echo "nameserver $dns_server" | sudo tee -a /etc/resolv.conf > /dev/null
        fi
    done
    
    echo "Network setup completed for interface $interface."
    
    sudo chown -R $(whoami):www-data /home/$(whoami)
    
    DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
    # check if docker compose is installed
    if command -v docker &> /dev/null && docker compose version &> /dev/null; then
        echo "docker compose command is available"
    else
        echo "docker compose command is not available"
        mkdir -p $DOCKER_CONFIG/cli-plugins
        curl -SL https://github.com/docker/compose/releases/download/v2.3.3/docker-compose-linux-aarch64 -o $DOCKER_CONFIG/cli-plugins/docker-compose
        chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
    fi
    
    # May need to logout and login to apply docker group changes
    if ! docker ps >/dev/null 2>&1; then
        echo "Docker installed. Adding $(whoami) to the 'docker' group..."
        sudo usermod -aG docker $(whoami)
        echo -e "${RED}User added to \`docker\` group but the session must be reloaded to access the Docker daemon. Please log out, log back in, and rerun the script. Exiting...${NC}"
        exit 0
    fi
    
    # Enable IP forwarding
    echo "Enabling IP forwarding..."
    echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward > /dev/null
    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf > /dev/null
        sudo sysctl -p > /dev/null
    fi
    
    # Add UFW rules for Docker
    echo "Adding UFW rules for Docker..."
    sudo ufw allow in on docker0 from 192.168.1.0/24 to any
    sudo ufw allow out on docker0 from 192.168.1.0/24 to any
    
    sudo iptables -t nat -A POSTROUTING -o wwan0 -j MASQUERADE
    sudo ufw route allow in on docker0 out on wwan0
    sudo ufw route allow out on wwan0 in on docker0
    # Save iptables rules using ufw
    echo "Saving iptables rules using ufw..."
    echo "y" | sudo ufw disable
    echo "y" | sudo ufw enable
    
    # Configure Docker to avoid IP conflicts
    echo "Configuring Docker..."
    sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
    "bip": "192.168.1.1/24",
    "dns": ["8.8.8.8", "8.8.4.4"]
}
EOF
    
    # Restart Docker service
    echo "Restarting Docker..."
    sudo systemctl restart docker
    
    # Check and enable all uarts with dtoverlay=uartx
    for uart in 0 1 2 3; do
        if ! grep -q "dtoverlay=uart${uart}" /boot/firmware/config.txt; then
            echo "dtoverlay=uart${uart}" | sudo tee -a /boot/firmware/config.txt
        fi
    done
fi

#### INSTALL ####
if [[ "$1" != "--setup-only" ]]; then
    cd ~
    sudo rm -rf canarygc
    git clone https://github.com/judahpaul16/canarygc.git
    cd canarygc
    sudo chown -R $(whoami):www-data /home/$(whoami)/canarygc
    sudo chmod +x contrib/setup.sh
    
    if [[ "$1" == "--simulation" ]]; then
        docker compose down && docker system prune -f && docker compose up -d
    else
        docker compose -f docker-compose.prod.yml down
        docker system prune -af
        if libcamera-hello --list-cameras | grep -q "No cameras available!"; then
            echo "No cameras found."
            docker compose -f docker-compose.prod.yml up app -d
        else
            docker compose -f docker-compose.prod.yml up app webrtc -d
        fi
    fi
    sleep 5
    docker ps
fi

#### 4G SERVICE ####
if [[ "$1" != "--install-only" && "$1" != "--setup-only" && "$1" != "--simulation" ]]; then
    # Create systemd service file
  sudo tee /etc/systemd/system/mobile-network-setup.service > /dev/null <<EOF
[Unit]
Description=4G Mobile Network Setup
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/home/$(whoami)/canarygc/contrib/setup.sh --setup-only
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
    
    # Enable and start the service
    sudo systemctl enable mobile-network-setup.service
    sudo systemctl start mobile-network-setup.service
    sudo systemctl status mobile-network-setup.service --no-pager
fi