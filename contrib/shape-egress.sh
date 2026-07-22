#!/bin/bash

# Prioritizes telemetry over video on the cellular uplink. Station TCP replies
# (nginx 80, app 3000) are marked DSCP EF and WebRTC media (UDP 8189) AF41,
# then a CAKE queue on the modem interface schedules EF ahead of AF41 ahead of
# everything else whenever the link saturates. Usage:
#
#   shape-egress.sh [iface] [bandwidth]   install (defaults: default-route iface, 4mbit)
#   shape-egress.sh --off [iface]         remove the marks and the queue

set -e

if [[ "$1" == "--off" ]]; then
    IFACE="${2:-$(ip route show default | awk '{print $5; exit}')}"
    sudo nft delete table inet canarygc 2>/dev/null || true
    sudo tc qdisc del dev "$IFACE" root 2>/dev/null || true
    echo "Egress shaping removed from $IFACE."
    exit 0
fi

IFACE="${1:-$(ip route show default | awk '{print $5; exit}')}"
BANDWIDTH="${2:-4mbit}"

if [ -z "$IFACE" ]; then
    echo "No default route interface found. Pass the modem interface: shape-egress.sh wwan0"
    exit 1
fi

if ! command -v nft >/dev/null || ! command -v tc >/dev/null; then
    sudo apt-get update
    sudo apt-get -y install nftables iproute2
fi

sudo nft delete table inet canarygc 2>/dev/null || true
sudo nft -f - <<EOF
table inet canarygc {
    chain egress {
        type filter hook postrouting priority mangle; policy accept;
        oifname "$IFACE" tcp sport { 80, 3000 } ip dscp set ef
        oifname "$IFACE" tcp sport { 80, 3000 } ip6 dscp set ef
        oifname "$IFACE" udp sport 8189 ip dscp set af41
        oifname "$IFACE" udp sport 8189 ip6 dscp set af41
    }
}
EOF

# diffserv4 puts EF in the Voice tin and AF41 in the Video tin; wash clears the
# marks after tin selection so the carrier never sees them. The bandwidth must
# sit just under the link's real uplink rate or the queue forms in the modem
# instead of here.
sudo tc qdisc replace dev "$IFACE" root cake bandwidth "$BANDWIDTH" diffserv4 wash

echo "Egress shaping active on $IFACE at $BANDWIDTH."
echo "Verify with: tc -s qdisc show dev $IFACE"
